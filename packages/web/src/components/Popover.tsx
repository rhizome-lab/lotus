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
      // Calculate position
      if (triggerRef) {
        const rect = (triggerRef as HTMLElement).getBoundingClientRect();
        setPosition({
          top: rect.bottom + window.scrollY + 5,
          left: rect.left + window.scrollX,
        });
      }
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
            ref={contentRef}
            class={props.contentClass}
            style={{
              position: "absolute",
              top: `${position().top}px`,
              left: `${position().left}px`,
              "z-index": 1000,
            }}
          >
            {props.children({ close })}
          </div>
        </Portal>
      </Show>
    </>
  );
}
