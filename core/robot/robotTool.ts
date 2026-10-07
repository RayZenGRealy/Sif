import { ToolDefinition } from '../tools/toolRegistry';

export interface RobotAction {
  action: string;
  parameters?: Record<string, unknown>;
}

export interface RobotActionResult {
  accepted: boolean;
  message?: string;
  state?: Record<string, unknown>;
}

export function createRobotTool(
  id: string,
  name: string,
  description: string,
  executor: (action: RobotAction) => Promise<RobotActionResult>,
): ToolDefinition<RobotAction, RobotActionResult> {
  return {
    id,
    name,
    description,
    kind: 'robot',
    requiresConfirmation: true,
    run: async action => executor(action),
  };
}
