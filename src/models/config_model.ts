import mongoose, { Schema } from 'mongoose';

export interface ConfigDoc extends mongoose.Document {
  key: string;
  data: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

const ConfigSchema = new Schema<ConfigDoc>({
  key: { type: String, required: true, unique: true },
  data: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

ConfigSchema.index({ key: 1 }, { unique: true });

const ConfigModel = mongoose.model<ConfigDoc>('Config', ConfigSchema);
export default ConfigModel;

