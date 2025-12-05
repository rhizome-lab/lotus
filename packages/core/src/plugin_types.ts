// TODO: Autogenerate this without introducing dependency on @viwo/plugin-ai
declare global {
  namespace ai {
    function text(modelSpec: string, prompt: string, system?: string): string;
    function json(modelSpec: string, prompt: string): object;
  }
}

export {};
