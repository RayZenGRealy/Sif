export type TrainingMethod = 'sft' | 'lora' | 'qlora' | 'dpo' | 'rl';

export interface TrainingExample {
  id: string;
  input: string;
  output: string;
  system?: string;
  attachments?: Array<{
    type: 'image' | 'audio' | 'video' | 'file';
    uri: string;
  }>;
  metadata?: Record<string, unknown>;
}

export interface TrainingJobConfig {
  name: string;
  baseModel: string;
  method: TrainingMethod;
  datasetId: string;
  epochs?: number;
  learningRate?: number;
  outputName?: string;
  targetModules?: string[];
  metadata?: Record<string, unknown>;
}

export interface TrainingJob {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  config: TrainingJobConfig;
  createdAt: number;
  updatedAt: number;
  progress?: number;
  metrics?: Record<string, number>;
  outputModel?: string;
  error?: string;
}

export interface TrainingBackend {
  readonly id: string;
  readonly displayName: string;
  submit(config: TrainingJobConfig): Promise<TrainingJob>;
  get(jobId: string): Promise<TrainingJob>;
  cancel(jobId: string): Promise<void>;
}
