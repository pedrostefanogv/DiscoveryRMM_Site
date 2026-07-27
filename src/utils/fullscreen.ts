// Empty utility module - will be implemented in future phases
export const fullscreenApi = {
    request: async (el: HTMLElement) => {
        if (el.requestFullscreen) await el.requestFullscreen();
    },
    exit: async () => {
        if (document.exitFullscreen) await document.exitFullscreen();
    },
};
