import mongoose from 'mongoose'

const storySchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  title: { type: String, required: true, trim: true },
  category: { type: String, required: true, trim: true },
  excerpt: { type: String, required: true, trim: true },
  author: { type: String, default: 'WAVE Editorial', trim: true },
  date: { type: Date, required: true, default: Date.now, index: true },
  image: { type: String, default: '' },
  body: { type: [String], required: true, validate: value => value.length > 0 },
  published: { type: Boolean, default: false, index: true },
}, { timestamps: true, versionKey: false })

storySchema.set('toJSON', {
  transform: (_document, value) => {
    value.date = value.date instanceof Date ? value.date.toISOString().slice(0, 10) : value.date
    delete value._id
    return value
  },
})

export default mongoose.model('Story', storySchema)
