import mongoose, { Schema } from 'mongoose';

const CandidateSchema = new Schema({
  id: { type: String, required: true },
  score: { type: Number, required: true },
  components: { type: Schema.Types.Mixed },
  summary: { type: Schema.Types.Mixed },
  game: { type: Schema.Types.Mixed },
  selected: { type: Boolean, default: false },
});

const FeaturedSnapshotSchema = new Schema({
  key: { type: String, default: 'current', unique: true, index: true },
  generated_at: { type: Date, required: true },
  selected_id: { type: String, required: true },
  weights: { type: Schema.Types.Mixed },
  items: { type: [CandidateSchema], default: [] },
}, { timestamps: true });

const FeaturedSnapshotModel = mongoose.model('FeaturedSnapshot', FeaturedSnapshotSchema);
export default FeaturedSnapshotModel;

