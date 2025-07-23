const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const passport = require('passport');
const session = require('express-session');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const path = require('path');

const app = express();
const PORT = 3000;
const JWT_SECRET = '12345678';

// MongoDB
mongoose.connect('mongodb+srv://user1:malafiki@leodb.5mf7q.mongodb.net/?retryWrites=true&w=majority&appName=leodb')
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.log(err));

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Cloudinary
cloudinary.config({
  cloud_name: 'drxvftof4',
  api_key: '872961783425164',
  api_secret: 'KWEJ6SbPybty7YefACspZ-j-ym0'
});
const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder: 'media_uploads',
    resource_type: 'auto',
  }),
});
const upload = multer({ storage });

// Passport
app.use(session({ secret: 'secret123', resave: false, saveUninitialized: true }));
app.use(passport.initialize());
app.use(passport.session());

// Models
const Admin = require('./models/Admin');
const Media = require('./models/Media');
const User = require('./models/User');
const Comment = require('./models/Comment');

// Google Auth
passport.use(new GoogleStrategy({
  clientID: '199468518160-0ubjlcvm41a5gk0ud78fkpfuu5kn0v7a.apps.googleusercontent.com',
  clientSecret: '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',
  callbackURL: 'https://saint-platform.onrender.com'
}, async (accessToken, refreshToken, profile, done) => {
  let admin = await Admin.findOne({ googleId: profile.id });
  if (!admin) {
    admin = await Admin.create({
      googleId: profile.id,
      email: profile.emails[0].value,
      profilePhoto: profile.photos[0].value
    });
  }
  return done(null, admin);
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  const admin = await Admin.findById(id);
  done(null, admin);
});

// Email setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'zumalipas@gmail.com',
    pass: 'xsds bimk ndlb vmrr'
  }
});

// ROUTES

// Register Admin
app.post('/register', async (req, res) => {
  try {
    const { email, password, confirmPassword } = req.body;
    if (!email || !password || !confirmPassword) return res.status(400).send('All fields required');
    if (password !== confirmPassword) return res.status(400).send('Passwords do not match');

    const exists = await Admin.findOne({ email });
    if (exists) return res.status(400).send('Email already registered');

    const hashed = await bcrypt.hash(password, 10);
    await Admin.create({ email, password: hashed });

    res.status(201).send('Admin registered');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error');
  }
});

// Admin Login
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const admin = await Admin.findOne({ email });
  if (!admin || !(await bcrypt.compare(password, admin.password))) return res.status(401).send('Invalid');

  const token = jwt.sign({
    id: admin._id,
    email: admin.email,
    photo: admin.profilePhoto || null
  }, JWT_SECRET);

  res.json({ token });
});


// Forgot Password (send new password to email)
app.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).send('Email required');
  const admin = await Admin.findOne({ email });
  if (!admin) return res.status(404).send('No account with that email');
  // Generate a new random password
  const newPassword = Math.random().toString(36).slice(-10) + Math.floor(Math.random()*10);
  const hashed = await bcrypt.hash(newPassword, 10);
  admin.password = hashed;
  await admin.save();
  try {
    await transporter.sendMail({
      from: 'zumalipas@gmail.com',
      to: email,
      subject: 'Your New Admin Password',
      html: `<p>Your new password is: <b>${newPassword}</b></p><p>Please log in and change it immediately.</p>`
    });
    res.send('A new password has been sent to your email.');
  } catch (err) {
    res.status(500).send('Failed to send email');
  }
});


// Remove reset-password endpoint (no longer needed)

// Google OAuth Login
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback', passport.authenticate('google', {
  failureRedirect: '/login.html'
}), (req, res) => {
  const token = jwt.sign({
    id: req.user._id,
    email: req.user.email,
    photo: req.user.profilePhoto || null
  }, JWT_SECRET);
  res.redirect(`/admin.html?token=${token}`);
});

// Upload media
app.post('/upload', upload.single('file'), async (req, res) => {
  const { name, description, adminId, type } = req.body;
  const media = await Media.create({
    name,
    description,
    type,
    url: req.file.path,
    admin: adminId
  });

  const users = await User.find({ subscribed: true });
  users.forEach(user => {
    transporter.sendMail({
      from: 'zumalipas@gmail.com',
      to: user.email,
      subject: `New ${type} Uploaded`,
      html: `<p>${name}: ${description}</p><a href="http://localhost:3000/media.html">View</a>`
    });
  });

  res.json(media);
});

// List Media
app.get('/media', async (req, res) => {
  const { name, date, type, platform, sort } = req.query;
  const filter = {};
  if (name) filter.name = { $regex: name, $options: 'i' };
  if (date) {
    const start = new Date(date);
    const end = new Date(date);
    end.setDate(end.getDate() + 1);
    filter.createdAt = { $gte: start, $lt: end };
  }
  if (type) filter.type = type;
  if (platform) filter.platform = platform;
  const sortObj = sort === 'asc' ? { createdAt: 1 } : { createdAt: -1 };
  const media = await Media.find(filter).populate('comments').sort(sortObj);
  res.json(media);
});

// Delete Media
app.delete('/media/:id', async (req, res) => {
  await Media.findByIdAndDelete(req.params.id);
  res.sendStatus(204);
});

// Like / Dislike
app.post('/like/:id', async (req, res) => {
  const media = await Media.findByIdAndUpdate(req.params.id, { $inc: { likes: 1 } }, { new: true });
  res.json(media);
});
app.post('/dislike/:id', async (req, res) => {
  const media = await Media.findByIdAndUpdate(req.params.id, { $inc: { dislikes: 1 } }, { new: true });
  res.json(media);
});

// Comments
app.post('/comment/:mediaId', async (req, res) => {
  const { text, name } = req.body;
  const comment = await Comment.create({ text, userName: name, media: req.params.mediaId });
  await Media.findByIdAndUpdate(req.params.mediaId, { $push: { comments: comment._id } });
  res.json(comment);
});

// Recursive reply to a comment or reply
app.post('/comment/:commentId/reply', async (req, res) => {
  const { text, name, parentReplyPath } = req.body; // parentReplyPath is an array of reply indexes
  try {
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) return res.status(404).json({ error: 'Comment not found.' });
    let target = comment;
    if (Array.isArray(parentReplyPath) && parentReplyPath.length > 0) {
      for (const idx of parentReplyPath) {
        if (!target.replies[idx]) return res.status(404).json({ error: 'Reply path invalid.' });
        target = target.replies[idx];
      }
    }
    target.replies = target.replies || [];
    target.replies.push({ userName: name, text, createdAt: new Date(), replies: [] });
    await comment.save();
    res.json(comment);
  } catch (err) {
    res.status(500).json({ error: 'Failed to reply.' });
  }
});

// Delete a comment
app.delete('/comment/:commentId', async (req, res) => {
  try {
    const comment = await Comment.findByIdAndDelete(req.params.commentId);
    if (!comment) return res.status(404).json({ error: 'Comment not found.' });
    // Remove comment reference from media
    await Media.findByIdAndUpdate(comment.media, { $pull: { comments: comment._id } });
    res.json({ message: 'Comment deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete comment.' });
  }
});

// Delete a reply from a comment
app.delete('/comment/:commentId/reply/:replyIndex', async (req, res) => {
  try {
    const { commentId, replyIndex } = req.params;
    const comment = await Comment.findById(commentId);
    if (!comment) return res.status(404).json({ error: 'Comment not found.' });
    if (!comment.replies || !comment.replies[replyIndex]) return res.status(404).json({ error: 'Reply not found.' });
    comment.replies.splice(replyIndex, 1);
    await comment.save();
    res.json({ message: 'Reply deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete reply.' });
  }
});

// Register Subscriber
app.post('/register-user', async (req, res) => {
  const { email } = req.body;
  if (!email || typeof email !== 'string' || !email.trim()) {
    return res.status(400).send('Email is required.');
  }
  const exists = await User.findOne({ email });
  if (exists) return res.status(400).send('Already registered');
  const user = await User.create({ email });
  res.json(user);
});

// Unsubscribe
app.post('/unsubscribe', async (req, res) => {
  await User.findOneAndUpdate({ email: req.body.email }, { subscribed: false });
  res.send('Unsubscribed');
});

// Upload Admin Profile Photo
app.post('/upload-profile/:adminId', upload.single('photo'), async (req, res) => {
  try {
    const admin = await Admin.findByIdAndUpdate(
      req.params.adminId,
      { profilePhoto: req.file.path },
      { new: true }
    );
    res.json({ message: 'Profile updated', photo: admin.profilePhoto });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error updating profile');
  }
});

// Get Admin Profile Photo
app.get('/admin/profile-photo/:id', async (req, res) => {
  const admin = await Admin.findById(req.params.id);
  res.json({ photo: admin.profilePhoto || null });
});

// Subscriber Count
app.get('/subscribers-count/:mediaId', async (req, res) => {
  try {
    // Always return the total number of subscribed users (same for all media)
    const count = await User.countDocuments({ subscribed: true });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: 'Failed to count subscribers' });
  }
});

// Get all subscribers and count
app.get('/subscribers', async (req, res) => {
  try {
    const users = await User.find({ subscribed: true });
    res.json({ count: users.length, users });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch subscribers' });
  }
});

// Efficient endpoint for bell icon: returns only the live subscriber count
app.get('/subscribers/count', async (req, res) => {
  try {
    const count = await User.countDocuments({ subscribed: true });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: 'Failed to count subscribers' });
  }
});

// Edit Media
app.put('/media/:id', async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || !description) return res.status(400).json({ error: 'Name and description are required.' });

    const updated = await Media.findByIdAndUpdate(
      req.params.id,
      { name, description },
      { new: true }
    );

    if (!updated) return res.status(404).json({ error: 'Media not found.' });

    // Notify all subscribed users about the update
    const users = await User.find({ subscribed: true });
    const emailHtml = (media, name, description) => `
      <div style="font-family: Arial, sans-serif; background: #f9f9f9; padding: 20px;">
        <div style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; padding: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
          <h2 style="color: #4f46e5; margin-bottom: 8px;">✏️ Media Updated!</h2>
          <p style="font-size: 18px; color: #222; margin-bottom: 8px;"><strong>${name}</strong></p>
          <p style="font-size: 15px; color: #555; margin-bottom: 20px;">${description}</p>
          <div style="margin: 24px 0; text-align: center;">
            <a href="http://localhost:3000/media.html?highlight=${media._id}" 
              style="display: inline-block; background: linear-gradient(90deg,#6366f1,#4f46e5); color: #fff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: bold; box-shadow: 0 2px 8px #6366f133; transition: background 0.2s;">
              🔗 View Updated Media
            </a>
          </div>
          <hr style="border:none; border-top:1px solid #eee; margin:24px 0;">
          <p style="font-size: 12px; color: #aaa; text-align:center;">You are receiving this because you subscribed to Saints Gallery updates.<br>To unsubscribe, visit the site and click unsubscribe.</p>
        </div>
      </div>
    `;
    for (const user of users) {
      try {
        await transporter.sendMail({
          from: 'zumalipas@gmail.com',
          to: user.email,
          subject: `✏️ Media Updated in Saints Gallery`,
          html: emailHtml(updated, name, description)
        });
      } catch (err) {
        console.error('Email error:', err);
      }
    }

    res.status(200).json(updated);
  } catch (err) {
    console.error('Error updating media:', err);
    res.status(500).json({ error: 'Server error while updating media.' });
  }
});

// Start server
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
