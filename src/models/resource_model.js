import mongoose, { Schema } from 'mongoose';

const ResourceSchema = new Schema({
  title: { type: String, default: 'Untitled' },
  description: { type: String, default: '' },
  value: { type: Number, default: null },
  date_resource_created: { type: Date, default: Date.now() }, // default JSON date format for JS: https://stackoverflow.com/a/15952652/10256611,
  child_resources: [{ type: Schema.Types.ObjectId, ref: 'SubResource' }],
});

const ResourceModel = mongoose.model('Resource', ResourceSchema);

export default ResourceModel;
