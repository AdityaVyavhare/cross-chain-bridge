import { useEffect, useRef } from "react";
import { useDispatch } from "react-redux";
import {
  startListeners,
  loadHistoricalEvents,
  stopListeners,
} from "../services/eventService";

/**
 * Hook that starts real-time event listeners and loads historical data.
 * Call this once at the top of your app tree (e.g. in App.js).
 */
export default function useBridgeEvents() {
  const dispatch = useDispatch();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    // Boot real-time listeners
    startListeners(dispatch);

    // Load past events
    loadHistoricalEvents(dispatch);

    return () => {
      stopListeners();
      started.current = false;
    };
  }, [dispatch]);
}
