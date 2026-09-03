import { useEffect, type RefObject } from "react";

const focusableSelector = "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]";

export function useModalFocusTrap(containerRef: RefObject<HTMLElement | null>) {
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const modalContainer = container;

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key !== "Tab" || event.defaultPrevented) return;
            const focusable = Array.from(modalContainer.querySelectorAll<HTMLElement>(focusableSelector));
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }

        modalContainer.addEventListener("keydown", handleKeyDown);
        return () => modalContainer.removeEventListener("keydown", handleKeyDown);
    }, [containerRef]);
}
