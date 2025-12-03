import { Component, For, Show, createMemo } from "solid-js";
import { BlockDefinition } from "./types";

interface BlockNodeProps {
  node: any;
  path: number[];
  opcodes: BlockDefinition[];
  onUpdate: (path: number[], newNode: any) => void;
  onDelete: (path: number[]) => void;
}

export const BlockNode: Component<BlockNodeProps> = (props) => {
  const isArray = createMemo(() => Array.isArray(props.node));

  // Handle null/placeholder
  const isNull = createMemo(() => props.node === null);

  const handleDrop = (e: DragEvent, path: number[]) => {
    e.preventDefault();
    e.stopPropagation();
    const data = e.dataTransfer?.getData("application/json");
    if (!data) return;

    try {
      const { opcode } = JSON.parse(data);
      const opcodes = props.opcodes || [];
      const def = opcodes.find((d) => d.opcode === opcode);
      if (!def) return;

      let newNode: any = [opcode];
      if (def.slots) {
        def.slots.forEach((slot) => {
          newNode.push(slot.default !== undefined ? slot.default : null);
        });
      }
      props.onUpdate(path, newNode);
    } catch (err) {
      console.error("Drop error", err);
    }
  };

  return (
    <Show
      when={!isNull()}
      fallback={
        <div
          class="block-node block-node--placeholder"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => handleDrop(e, props.path)}
        >
          Empty Slot
        </div>
      }
    >
      <Show
        when={isArray()}
        fallback={
          <div class="block-node block-node--literal">
            <input
              class="block-node__input"
              value={props.node}
              onInput={(e) => props.onUpdate(props.path, e.currentTarget.value)}
            />
          </div>
        }
      >
        {(() => {
          const opcode = createMemo(() => props.node[0]);
          const def = createMemo(() => {
            const opcodes = props.opcodes || [];
            return opcodes.find((d) => d.opcode === opcode());
          });
          const args = createMemo(() => props.node.slice(1));

          return (
            <Show
              when={def()}
              fallback={<div class="block-node block-node--unknown">Unknown: {opcode()}</div>}
            >
              <div
                class={`block-node block-node--${def()!.type} block-node--${
                  def()!.category
                } ${def()!.layout ? `block-node--${def()!.layout}` : ""}`}
              >
                {/* Header/Label - Hide for primitives and infix (unless we want it) */}
                <Show when={def()!.layout !== "primitive" && def()!.layout !== "infix"}>
                  <div class="block-node__header">
                    <Show when={def()!.opcode !== "seq"}>
                      <span class="block-node__label">{def()!.label}</span>
                    </Show>

                    {/* Control Flow: Render first slot (Condition) in header */}
                    <Show
                      when={
                        def()!.layout === "control-flow" && def()!.slots && def()!.slots!.length > 0
                      }
                    >
                      <div class="block-node__header-slot">
                        <Show
                          when={args()[0] !== undefined}
                          fallback={
                            <div
                              class="block-node__placeholder"
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={(e) => handleDrop(e, [...props.path, 1])}
                            >
                              Condition
                            </div>
                          }
                        >
                          <BlockNode
                            node={args()[0]}
                            path={[...props.path, 1]}
                            opcodes={props.opcodes}
                            onUpdate={props.onUpdate}
                            onDelete={props.onDelete}
                          />
                        </Show>
                      </div>
                    </Show>

                    <button
                      class="block-node__delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        props.onDelete(props.path);
                      }}
                    >
                      &times;
                    </button>
                  </div>
                </Show>

                {/* Primitive Layout: Just input + delete */}
                <Show when={def()!.layout === "primitive"}>
                  <div class="block-node__primitive">
                    <Show
                      when={def()!.opcode === "boolean"}
                      fallback={
                        <input
                          type={def()!.opcode === "number" ? "number" : "text"}
                          class="block-node__input block-node__input--primitive"
                          value={args()[0]}
                          onInput={(e) =>
                            props.onUpdate(
                              [...props.path, 1],
                              def()!.opcode === "number"
                                ? Number(e.currentTarget.value)
                                : e.currentTarget.value,
                            )
                          }
                        />
                      }
                    >
                      <select
                        class="block-node__select"
                        value={String(args()[0])}
                        onChange={(e) =>
                          props.onUpdate([...props.path, 1], e.currentTarget.value === "true")
                        }
                      >
                        <option value="true">True</option>
                        <option value="false">False</option>
                      </select>
                    </Show>
                    <button
                      class="block-node__delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        props.onDelete(props.path);
                      }}
                    >
                      &times;
                    </button>
                  </div>
                </Show>

                <div class="block-node__content">
                  <Show when={def()!.opcode === "seq"}>
                    <div class="block-node__sequence">
                      <For each={args()}>
                        {(arg, i) => (
                          <BlockNode
                            node={arg}
                            path={[...props.path, i() + 1]}
                            opcodes={props.opcodes}
                            onUpdate={props.onUpdate}
                            onDelete={props.onDelete}
                          />
                        )}
                      </For>
                    </div>
                  </Show>

                  <Show
                    when={def()!.opcode !== "seq" && def()!.slots && def()!.layout !== "primitive"}
                  >
                    <For each={def()!.slots}>
                      {(slot, i) => (
                        <Show
                          when={
                            // Skip first slot for control-flow as it's in header
                            !(def()!.layout === "control-flow" && i() === 0)
                          }
                        >
                          <>
                            {/* Infix Operator between args */}
                            <Show when={def()!.layout === "infix" && i() === 1}>
                              <div class="block-node__infix-op">{def()!.label}</div>
                            </Show>

                            <div
                              class={`block-node__slot ${
                                def()!.layout === "infix" ? "block-node__slot--infix" : ""
                              }`}
                            >
                              <Show when={def()!.layout !== "infix"}>
                                <span class="block-node__slot-label">{slot.name}:</span>
                              </Show>

                              <div class="block-node__slot-content">
                                <Show
                                  when={args()[i()] !== undefined}
                                  fallback={
                                    <div
                                      class="block-node__placeholder"
                                      onDragOver={(e) => e.preventDefault()}
                                      onDrop={(e) => handleDrop(e, [...props.path, i() + 1])}
                                    >
                                      {def()!.layout === "infix" ? "?" : "Drop here"}
                                    </div>
                                  }
                                >
                                  <BlockNode
                                    node={args()[i()]}
                                    path={[...props.path, i() + 1]}
                                    opcodes={props.opcodes}
                                    onUpdate={props.onUpdate}
                                    onDelete={props.onDelete}
                                  />
                                </Show>
                              </div>
                            </div>
                          </>
                        </Show>
                      )}
                    </For>

                    {/* Delete button for infix at the end */}
                    <Show when={def()!.layout === "infix"}>
                      <button
                        class="block-node__delete block-node__delete--infix"
                        onClick={(e) => {
                          e.stopPropagation();
                          props.onDelete(props.path);
                        }}
                      >
                        &times;
                      </button>
                    </Show>
                  </Show>
                </div>
              </div>
            </Show>
          );
        })()}
      </Show>
    </Show>
  );
};
