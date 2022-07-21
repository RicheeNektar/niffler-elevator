import express from 'express';
import 'dotenv/config';
import Spotify from './spotify/index.js';
import paths from './paths/index.js';

new Spotify();

const app = express();
const port = process.env.PORT;

if (port === undefined) {
  throw new Error("Missing PORT environment variable");
}

app.set('view engine', 'pug');
app.use(
  express.urlencoded({
    extended: true,
  })
);

app.use((_, res, next) => {
  if (!Spotify.spotify.getPlaylistName()) {
    res.write("Server not ready yet...");
    return res.send();
  }
  
  next();
});

app.use((req, res, next) => {
  res.locals = {
    playlist_name: Spotify.spotify.getPlaylistName(),
    authed: req.query?.authed,
    success: req.query?.success,
    already_added: req.query?.already_added,
    auth_missing: Spotify.spotify.getToken() === undefined,
  };

  next();
});

// Register paths
paths.forEach(f => f(app));

app.get('/', (_req, res) => {
  res.render('index');
});

app.listen(port, () => {
  console.log(`Listening at http://localhost:${port}`);
});
