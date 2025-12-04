import { createEffect, For } from "solid-js";
import { gameStore } from "../store/game";

const MessageView = (props: { text: string; type: "message" | "error" }) => (
  <div
    classList={{
      "game-log__message": true,
      "game-log__message--error": props.type === "error",
    }}
  >
    {props.text}
  </div>
);

export default function GameLog() {
  let containerRef: HTMLDivElement | undefined;

  // Auto-scroll to bottom
  createEffect(() => {
    // oxlint-disable-next-line no-unused-expressions
    gameStore.state.messages.length; // dependency
    if (containerRef) {
      containerRef.scrollTop = containerRef.scrollHeight;
    }
  });

  return (
    <div ref={(el) => (containerRef = el)} class="game-log">
      <For each={gameStore.state.messages}>
        {(msg) => {
          switch (msg.type) {
            case "message":
              return <MessageView text={msg.text} type={msg.type} />;
            default:
              return null;
          }
        }}
      </For>
    </div>
  );
}
