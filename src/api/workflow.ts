import { api } from "./client";
import type {
  WorkflowState,
  WorkflowTransition,
  CreateWorkflowStateRequest,
  UpdateStateRequest,
  CreateWorkflowTransitionRequest,
} from "./types";

const STATES = "/api/Workflow/states";
const TRANSITIONS = "/api/Workflow/transitions";

export const workflowApi = {
  // States
  listStates: (clientId?: string) =>
    api.get<WorkflowState[]>(STATES, { clientId }),

  getState: (id: string) => api.get<WorkflowState>(`${STATES}/${id}`),

  createState: (data: CreateWorkflowStateRequest) =>
    api.post<WorkflowState>(STATES, data),

  updateState: (id: string, data: UpdateStateRequest) =>
    api.put<WorkflowState>(`${STATES}/${id}`, data),

  deleteState: (id: string) => api.del<void>(`${STATES}/${id}`),

  // Transitions
  listTransitions: (clientId?: string) =>
    api.get<WorkflowTransition[]>(TRANSITIONS, { clientId }),

  listTransitionsFrom: (fromStateId: string, clientId?: string) =>
    api.get<WorkflowTransition[]>(`${TRANSITIONS}/from/${fromStateId}`, {
      clientId,
    }),

  createTransition: (data: CreateWorkflowTransitionRequest) =>
    api.post<WorkflowTransition>(TRANSITIONS, data),

  deleteTransition: (id: string) => api.del<void>(`${TRANSITIONS}/${id}`),
};
