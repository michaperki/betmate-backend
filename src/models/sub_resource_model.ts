import mongoose, { Schema } from 'mongoose';

const SubResourceSchema = new Schema({
  title: { type: String, default: 'Untitled' },
  description: { type: String, default: '' },
  value: { type: Number, default: null },
  date_resource_created: { type: Date, default: Date.now() }, // default JSON date format for JS: https://stackoverflow.com/a/15952652/10256611
  parent_resource: { type: Schema.Types.ObjectId, ref: 'Resource' },
});

const SubResourceModel = mongoose.model('SubResource', SubResourceSchema);

export default SubResourceModel;
