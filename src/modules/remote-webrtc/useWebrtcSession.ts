import { useCallback, useEffect, useRef, useState } from "react";

interface UseWebrtcSessionParams {
  stunUrls?: string[];
  turnUrls?: string[];
  turnUsername?: string;
  turnCredential?: string;
  signalSubject?: string;
  onRemoteStream?: (stream: MediaStream) => void;
  onError?: (error: string) => void;
}

interface WebrtcState {
  status: "idle" | "connecting" | "connected" | "failed";
  error?: string;
}

export function useWebrtcSession({
  stunUrls = ["stun:stun.l.google.com:19302"],
  turnUrls = [],
  turnUsername = "",
  turnCredential = "",
  onRemoteStream,
  onError,
}: UseWebrtcSessionParams) {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [state, setState] = useState<WebrtcState>({ status: "idle" });
  const dcRef = useRef<RTCDataChannel | null>(null);

  const start = useCallback(async () => {
    try {
      setState({ status: "connecting" });

      const config: RTCConfiguration = {
        iceServers: [{ urls: stunUrls }],
      };

      if (turnUrls.length > 0 && turnUsername) {
        config.iceServers!.push({
          urls: turnUrls,
          username: turnUsername,
          credential: turnCredential,
        });
      }

      const pc = new RTCPeerConnection(config);
      pcRef.current = pc;

      // Recebe video track remoto
      pc.ontrack = (event) => {
        if (event.streams.length > 0 && onRemoteStream) {
          onRemoteStream(event.streams[0]);
        }
      };

      // Data channel para input (mouse/teclado)
      const dc = pc.createDataChannel("input");
      dcRef.current = dc;
      dc.onopen = () => setState({ status: "connected" });
      dc.onclose = () => setState({ status: "idle" });

      // ICE candidate gathering
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          // Sera enviado via NATS signal pelo componente pai
          // (implementado na integracao com nats-remote.ts na Fase 5)
        }
      };

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === "failed") {
          setState({
            status: "failed",
            error: "ICE connection failed — falling back to NATS relay",
          });
          onError?.("WebRTC ICE failed");
        }
      };

      // Cria offer
      const offer = await pc.createOffer({
        offerToReceiveVideo: true,
      });
      await pc.setLocalDescription(offer);

      // O offer SDP sera enviado via NATS pelo componente pai
    } catch (err) {
      setState({ status: "failed", error: String(err) });
      onError?.(`WebRTC start failed: ${err}`);
    }
  }, [
    stunUrls,
    turnUrls,
    turnUsername,
    turnCredential,
    onRemoteStream,
    onError,
  ]);

  const stop = useCallback(() => {
    dcRef.current?.close();
    pcRef.current?.close();
    pcRef.current = null;
    setState({ status: "idle" });
  }, []);

  const sendInput = useCallback((data: ArrayBuffer) => {
    if (dcRef.current?.readyState === "open") {
      dcRef.current.send(data);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    state,
    start,
    stop,
    sendInput,
    pcRef,
  };
}
