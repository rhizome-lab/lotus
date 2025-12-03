import { createSignal, Show, onCleanup, onMount, JSX } from "solid-js";
import { Portal } from "solid-js/web";

interface PopoverProps {
  trigger: (props: { onClick: (e: MouseEvent) => void }) => JSX.Element;
  children: (props: { close: () => void }) => JSX.Element;
  contentClass?: string;
  triggerWrapperClass?: string;
  triggerWrapperStyle?: JSX.CSSProperties;
}

export default function Popover(props: PopoverProps) {
  const [isOpen, setIsOpen] = createSignal(false);
  let triggerRef: HTMLDivElement | undefined = undefined;
  let contentRef: HTMLDivElement | undefined = undefined;
  const [position, setPosition] = createSignal({ top: 0, left: 0 });

  const toggle = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isOpen()) {
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  const close = () => setIsOpen(false);

  const handleClickOutside = (e: MouseEvent) => {
    if (
      isOpen() &&
      contentRef &&
      !(contentRef as HTMLElement).contains(e.target as Node) &&
      triggerRef &&
      !(triggerRef as HTMLElement).contains(e.target as Node)
    ) {
      setIsOpen(false);
    }
  };

  onMount(() => {
    document.addEventListener("click", handleClickOutside);
    onCleanup(() => document.removeEventListener("click", handleClickOutside));
  });

  return (
    <>
      <div
        ref={triggerRef}
        class={props.triggerWrapperClass}
        style={{ display: "inline-block", ...props.triggerWrapperStyle }}
      >
        {props.trigger({ onClick: toggle })}
      </div>
      <Show when={isOpen()}>
        <Portal>
          <div
            ref={(el) => {
              contentRef = el;
              if (triggerRef) {
                // Use requestAnimationFrame to ensure layout is complete
                requestAnimationFrame(() => {
                  const triggerRect = (triggerRef as HTMLElement).getBoundingClientRect();
                  const contentRect = el.getBoundingClientRect();
                  const viewportHeight = window.innerHeight;

                  let top = triggerRect.bottom + window.scrollY + 5;
                  let left = triggerRect.left + window.scrollX;

                  // Check if it overflows the bottom
                  if (triggerRect.bottom + contentRect.height + 5 > viewportHeight) {
                    // Check if it fits above
                    if (triggerRect.top - contentRect.height - 5 > 0) {
                      top = triggerRect.top + window.scrollY - contentRect.height - 5;
                    }
                  }

                  setPosition({ top, left });
                });
              }
            }}
            class={props.contentClass}
            style={{
              position: "absolute",
              top: `${position().top}px`,
              left: `${position().left}px`,
              "z-index": 1000,
              opacity: position().top === 0 ? 0 : 1, // Hide until positioned
            }}
          >
            {props.children({ close })}
          </div>
        </Portal>
      </Show>
    </>
  );
}
