import mongoose, { Schema, Document } from 'mongoose';

export interface ILocationCache extends Document {
  latitudeBucket: string;
  longitudeBucket: string;
  queryType: string; // 'hospital' | 'pharmacy' | 'police' | 'reverse-geocode' etc.
  results: any[];
  createdAt: Date;
}

const LocationCacheSchema = new Schema<ILocationCache>(
  {
    latitudeBucket: { type: String, required: true, index: true },
    longitudeBucket: { type: String, required: true, index: true },
    queryType: { type: String, required: true, index: true },
    results: { type: Schema.Types.Mixed, default: [] },
    createdAt: { type: Date, default: Date.now, expires: 1800 } // TTL 30 minutes
  },
  {
    collection: 'location_cache',
    timestamps: false
  }
);

// Compound index for fast lookups
LocationCacheSchema.index(
  { latitudeBucket: 1, longitudeBucket: 1, queryType: 1 },
  { unique: true }
);

const LocationCache: mongoose.Model<any> = mongoose.models.LocationCache || mongoose.model<ILocationCache>('LocationCache', LocationCacheSchema);

export default LocationCache;
