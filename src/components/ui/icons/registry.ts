import { CORE_SYMBOL_PATHS } from "./core";
import type {
  CoreMaterialSymbolName,
  IconChunkId,
  IconPathMap,
  MaterialSymbolName,
} from "./types";

type LazySymbolName = Exclude<MaterialSymbolName, CoreMaterialSymbolName>;

export const ICON_CHUNK_MAP: Record<LazySymbolName, IconChunkId> = {
  // filesMedia (31)
  add_photo_alternate: "filesMedia",
  all_inbox: "filesMedia",
  archive: "filesMedia",
  arrow_outward: "filesMedia",
  attach_file: "filesMedia",
  code: "filesMedia",
  content_copy: "filesMedia",
  content_cut: "filesMedia",
  content_paste: "filesMedia",
  create_new_folder: "filesMedia",
  database: "filesMedia",
  description: "filesMedia",
  download: "filesMedia",
  draft: "filesMedia",
  drive_folder_upload: "filesMedia",
  edit: "filesMedia",
  edit_note: "filesMedia",
  folder: "filesMedia",
  folder_zip: "filesMedia",
  format_bold: "filesMedia",
  format_italic: "filesMedia",
  format_list_numbered: "filesMedia",
  hide_image: "filesMedia",
  image: "filesMedia",
  ink_eraser: "filesMedia",
  movie: "filesMedia",
  music_note: "filesMedia",
  save: "filesMedia",
  table: "filesMedia",
  title: "filesMedia",
  upload: "filesMedia",

  // agentsHardware (32)
  arrow_downward: "agentsHardware",
  arrow_upward: "agentsHardware",
  bolt: "agentsHardware",
  bug_report: "agentsHardware",
  cable: "agentsHardware",
  cloud: "agentsHardware",
  cloud_upload: "agentsHardware",
  device_thermostat: "agentsHardware",
  devices: "agentsHardware",
  dns: "agentsHardware",
  important_devices: "agentsHardware",
  lan: "agentsHardware",
  laptop_chromebook: "agentsHardware",
  laptop_mac: "agentsHardware",
  memory: "agentsHardware",
  monitoring: "agentsHardware",
  open_with: "agentsHardware",
  phone_iphone: "agentsHardware",
  play_arrow: "agentsHardware",
  play_circle: "agentsHardware",
  podcasts: "agentsHardware",
  power_settings_new: "agentsHardware",
  restart_alt: "agentsHardware",
  schedule: "agentsHardware",
  settings_ethernet: "agentsHardware",
  settings_input_antenna: "agentsHardware",
  speed: "agentsHardware",
  storage: "agentsHardware",
  terminal: "agentsHardware",
  timer: "agentsHardware",
  tune: "agentsHardware",
  videocam: "agentsHardware",

  // ticketsWorkflow (44)
  account_circle: "ticketsWorkflow",
  account_tree: "ticketsWorkflow",
  add: "ticketsWorkflow",
  add_circle: "ticketsWorkflow",
  alarm: "ticketsWorkflow",
  arrow_back: "ticketsWorkflow",
  arrow_circle_up: "ticketsWorkflow",
  assignment: "ticketsWorkflow",
  auto_awesome: "ticketsWorkflow",
  bar_chart: "ticketsWorkflow",
  block: "ticketsWorkflow",
  bookmark: "ticketsWorkflow",
  calendar_month: "ticketsWorkflow",
  cancel: "ticketsWorkflow",
  chat: "ticketsWorkflow",
  chat_bubble_off: "ticketsWorkflow",
  check: "ticketsWorkflow",
  checklist: "ticketsWorkflow",
  compare_arrows: "ticketsWorkflow",
  do_not_disturb_on: "ticketsWorkflow",
  drag_indicator: "ticketsWorkflow",
  event: "ticketsWorkflow",
  fact_check: "ticketsWorkflow",
  filter_alt: "ticketsWorkflow",
  flag: "ticketsWorkflow",
  forum: "ticketsWorkflow",
  gpp_bad: "ticketsWorkflow",
  grid_view: "ticketsWorkflow",
  handshake: "ticketsWorkflow",
  help: "ticketsWorkflow",
  history: "ticketsWorkflow",
  home: "ticketsWorkflow",
  info: "ticketsWorkflow",
  lightbulb: "ticketsWorkflow",
  link: "ticketsWorkflow",
  link_off: "ticketsWorkflow",
  list: "ticketsWorkflow",
  more_vert: "ticketsWorkflow",
  open_in_new: "ticketsWorkflow",
  push_pin: "ticketsWorkflow",
  radio_button_checked: "ticketsWorkflow",
  star: "ticketsWorkflow",
  sticky_note_2: "ticketsWorkflow",
  unarchive: "ticketsWorkflow",

  // adminAnalytics (35)
  attach_money: "adminAnalytics",
  cleaning_services: "adminAnalytics",
  co_present: "adminAnalytics",
  how_to_reg: "adminAnalytics",
  inventory: "adminAnalytics",
  location_on: "adminAnalytics",
  lock_open: "adminAnalytics",
  manage_accounts: "adminAnalytics",
  menu_book: "adminAnalytics",
  merge: "adminAnalytics",
  merge_type: "adminAnalytics",
  numbers: "adminAnalytics",
  open_in_full: "adminAnalytics",
  paid: "adminAnalytics",
  palette: "adminAnalytics",
  person_add: "adminAnalytics",
  person_remove: "adminAnalytics",
  present_to_all: "adminAnalytics",
  print: "adminAnalytics",
  public: "adminAnalytics",
  rocket_launch: "adminAnalytics",
  schema: "adminAnalytics",
  sell: "adminAnalytics",
  shield: "adminAnalytics",
  smart_toy: "adminAnalytics",
  storefront: "adminAnalytics",
  swap_horiz: "adminAnalytics",
  tag: "adminAnalytics",
  toll: "adminAnalytics",
  trending_up: "adminAnalytics",
  verified: "adminAnalytics",
  view_list: "adminAnalytics",
  view_quilt: "adminAnalytics",
  visibility: "adminAnalytics",
  web: "adminAnalytics",
};

const CHUNK_LOADERS: Record<IconChunkId, () => Promise<IconPathMap>> = {
  filesMedia: () =>
    import("./chunks/filesMedia").then((m) => m.FILES_MEDIA_SYMBOL_PATHS),
  agentsHardware: () =>
    import("./chunks/agentsHardware").then(
      (m) => m.AGENTS_HARDWARE_SYMBOL_PATHS,
    ),
  ticketsWorkflow: () =>
    import("./chunks/ticketsWorkflow").then(
      (m) => m.TICKETS_WORKFLOW_SYMBOL_PATHS,
    ),
  adminAnalytics: () =>
    import("./chunks/adminAnalytics").then(
      (m) => m.ADMIN_ANALYTICS_SYMBOL_PATHS,
    ),
};

const symbolCache = new Map<string, readonly string[]>(
  Object.entries(CORE_SYMBOL_PATHS),
);
const listeners = new Set<() => void>();
const inFlight = new Map<IconChunkId, Promise<void>>();

function notifyListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function getMaterialSymbolPaths(
  name: string,
): readonly string[] | undefined {
  return symbolCache.get(name);
}

export function isKnownMaterialSymbol(name: string): boolean {
  return (
    symbolCache.has(name) ||
    Object.prototype.hasOwnProperty.call(ICON_CHUNK_MAP, name)
  );
}

export function ensureMaterialSymbolLoaded(name: string): Promise<void> {
  if (symbolCache.has(name)) {
    return Promise.resolve();
  }
  if (!Object.prototype.hasOwnProperty.call(ICON_CHUNK_MAP, name)) {
    return Promise.resolve();
  }
  const chunkId = ICON_CHUNK_MAP[name as LazySymbolName];
  const existing = inFlight.get(chunkId);
  if (existing) {
    return existing;
  }

  const promise = CHUNK_LOADERS[chunkId]()
    .then((entries) => {
      for (const [key, paths] of Object.entries(entries)) {
        symbolCache.set(key, paths);
      }
      notifyListeners();
    })
    .finally(() => {
      inFlight.delete(chunkId);
    });

  inFlight.set(chunkId, promise);
  return promise;
}

export function registerMaterialSymbols(entries: IconPathMap): void {
  let changed = false;
  for (const [key, paths] of Object.entries(entries)) {
    if (symbolCache.get(key) !== paths) {
      symbolCache.set(key, paths);
      changed = true;
    }
  }
  if (changed) {
    notifyListeners();
  }
}

export function resetIconRegistryToCore(): void {
  symbolCache.clear();
  for (const [key, paths] of Object.entries(CORE_SYMBOL_PATHS)) {
    symbolCache.set(key, paths);
  }
  inFlight.clear();
  notifyListeners();
}

export function subscribeIconRegistry(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
