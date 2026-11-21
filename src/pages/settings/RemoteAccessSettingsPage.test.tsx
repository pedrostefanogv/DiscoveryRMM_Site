import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./RemoteConsentSettings", () => ({
  default: ({ embedded }: { embedded?: boolean }) => (
    <div>ConsentPanel:{String(!!embedded)}</div>
  ),
}));

vi.mock("./RemoteProxyPolicySettings", () => ({
  default: ({ embedded }: { embedded?: boolean }) => (
    <div>ProxyPanel:{String(!!embedded)}</div>
  ),
}));

vi.mock("./RemoteAccessWebRtcSettings", () => ({
  default: ({ embedded }: { embedded?: boolean }) => (
    <div>WebRtcPanel:{String(!!embedded)}</div>
  ),
}));

import RemoteAccessSettingsPage from "./RemoteAccessSettingsPage";

afterEach(() => cleanup());

describe("RemoteAccessSettingsPage (unificada)", () => {
  it("renderiza as 3 abas em modo embedded e alterna entre elas", () => {
    render(
      <MemoryRouter>
        <RemoteAccessSettingsPage initialTab="consent" />
      </MemoryRouter>,
    );

    expect(screen.getByText("ConsentPanel:true")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Destinos do Proxy" }));
    expect(screen.getByText("ProxyPanel:true")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "WebRTC" }));
    expect(screen.getByText("WebRtcPanel:true")).toBeTruthy();
  });
});
