export type DashboardNatsScope =
  | { level: "global" }
  | { level: "client"; clientId: string }
  | { level: "site"; clientId: string; siteId: string };

interface BuildDashboardSubjectsOptions {
  includeScopedFallbacks?: boolean;
  includeSiteWildcardForClientScope?: boolean;
  includeGlobalWildcardSubjects?: boolean;
}

export const DASHBOARD_UNSCOPED_SUBJECT = "tenant.unscoped.dashboard.events";

function normalizeSegment(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function pushUnique(subjects: string[], subject: string | null | undefined) {
  const normalized = normalizeSegment(subject);
  if (!normalized) return;
  if (!subjects.includes(normalized)) {
    subjects.push(normalized);
  }
}

export function buildDashboardNatsSubjects(
  scope: DashboardNatsScope,
  options: BuildDashboardSubjectsOptions = {},
): string[] {
  const {
    includeScopedFallbacks = true,
    includeSiteWildcardForClientScope = true,
    includeGlobalWildcardSubjects = true,
  } = options;

  const subjects: string[] = [];

  if (scope.level === "site") {
    pushUnique(
      subjects,
      `tenant.${scope.clientId}.site.${scope.siteId}.dashboard.events`,
    );
    if (includeScopedFallbacks) {
      pushUnique(subjects, `tenant.${scope.clientId}.dashboard.events`);
      pushUnique(subjects, DASHBOARD_UNSCOPED_SUBJECT);
    }
  } else if (scope.level === "client") {
    if (includeSiteWildcardForClientScope) {
      pushUnique(subjects, `tenant.${scope.clientId}.site.*.dashboard.events`);
    }
    pushUnique(subjects, `tenant.${scope.clientId}.dashboard.events`);
    if (includeScopedFallbacks) {
      pushUnique(subjects, DASHBOARD_UNSCOPED_SUBJECT);
    }
  } else {
    if (includeGlobalWildcardSubjects) {
      pushUnique(subjects, "tenant.*.site.*.dashboard.events");
      pushUnique(subjects, "tenant.*.dashboard.events");
    }
    pushUnique(subjects, DASHBOARD_UNSCOPED_SUBJECT);
  }

  return subjects;
}

/**
 * Checks whether a concrete subject matches an allow-pattern that may include
 * NATS wildcards (`*` and `>`).
 */
export function natsSubjectMatches(pattern: string, subject: string): boolean {
  const normalizedPattern = pattern.trim();
  const normalizedSubject = subject.trim();

  if (!normalizedPattern || !normalizedSubject) {
    return false;
  }

  const patternTokens = normalizedPattern.split(".");
  const subjectTokens = normalizedSubject.split(".");

  let index = 0;
  for (; index < patternTokens.length; index += 1) {
    const patternToken = patternTokens[index];

    if (patternToken === ">") {
      // `>` only has valid semantics when used as the terminal token.
      return index === patternTokens.length - 1;
    }

    const subjectToken = subjectTokens[index];
    if (subjectToken === undefined) {
      return false;
    }

    if (patternToken === "*") {
      continue;
    }

    if (patternToken !== subjectToken) {
      return false;
    }
  }

  return index === subjectTokens.length;
}
