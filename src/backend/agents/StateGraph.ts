import { AgentState } from './AgentState';

export type NodeFunction = (state: AgentState) => Promise<Partial<AgentState> | void>;

export class StateGraph {
  private nodes: Map<string, NodeFunction> = new Map();
  private dependencies: Map<string, string[]> = new Map(); // node -> list of nodes that must finish first

  addNode(name: string, fn: NodeFunction) {
    this.nodes.set(name, fn);
    if (!this.dependencies.has(name)) {
      this.dependencies.set(name, []);
    }
  }

  addEdge(from: string, to: string) {
    if (!this.nodes.has(from)) {
      throw new Error(`Node '${from}' must be added before creating edge from it.`);
    }
    if (!this.nodes.has(to)) {
      throw new Error(`Node '${to}' must be added before creating edge to it.`);
    }
    const deps = this.dependencies.get(to) || [];
    if (!deps.includes(from)) {
      deps.push(from);
      this.dependencies.set(to, deps);
    }
  }

  async run(initialState: AgentState): Promise<AgentState> {
    // Deep clone state inputs/errors but keep other properties
    let state: AgentState = {
      ...initialState,
      inputs: { ...initialState.inputs },
      errors: [...initialState.errors]
    };
    
    const executed = new Set<string>();
    const running = new Set<string>();

    const getRunnableNodes = () => {
      const runnable: string[] = [];
      for (const nodeName of this.nodes.keys()) {
        if (executed.has(nodeName) || running.has(nodeName)) continue;
        const deps = this.dependencies.get(nodeName) || [];
        const allDepsMet = deps.every(dep => executed.has(dep));
        if (allDepsMet) {
          runnable.push(nodeName);
        }
      }
      return runnable;
    };

    while (executed.size < this.nodes.size) {
      const runnable = getRunnableNodes();

      if (runnable.length === 0 && running.size === 0) {
        const remaining = Array.from(this.nodes.keys()).filter(n => !executed.has(n));
        throw new Error(`Deadlock or cycle detected in StateGraph. Unexecuted nodes: ${remaining.join(', ')}`);
      }

      if (runnable.length > 0) {
        // Run all runnable nodes in parallel
        await Promise.all(
          runnable.map(async (nodeName) => {
            running.add(nodeName);
            try {
              console.log(`[StateGraph] Starting node: ${nodeName}`);
              const fn = this.nodes.get(nodeName)!;
              const update = await fn(state);
              if (update) {
                // Merge updates into state
                state = {
                  ...state,
                  ...update
                };
              }
              console.log(`[StateGraph] Completed node: ${nodeName}`);
            } catch (error: any) {
              console.error(`[StateGraph] Error in node '${nodeName}':`, error);
              state.errors.push(`${nodeName}: ${error?.message || error}`);
            } finally {
              running.delete(nodeName);
              executed.add(nodeName);
            }
          })
        );
      }
    }

    return state;
  }
}
