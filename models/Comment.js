const mongoose = require('mongoose');

const replySchema = new mongoose.Schema({
  userName: String, // changed from userEmail
  text: String,
  createdAt: { type: Date, default: Date.now },
  replies: [this] // recursive for nested replies
}, { _id: true });

const commentSchema = new mongoose.Schema({
  media: { type: mongoose.Schema.Types.ObjectId, ref: 'Media' },
  userName: String, // changed from userEmail
  text: String,
  createdAt: { type: Date, default: Date.now },
  replies: [replySchema]
});

module.exports = mongoose.model('Comment', commentSchema);
