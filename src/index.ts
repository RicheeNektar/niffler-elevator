import express from 'express';
import "dotenv/config";
import Spotify from './spotify/index.js';
import paths from './paths/index.js';

new Spotify();

const app = express();
const port = 8888;

app.set('view engine', 'pug');
app.use(
  express.urlencoded({
    extended: true,
  })
);

// Register paths
paths.forEach(f => f(app));

app.get('/', (req, res) => {
  res.render('index', {
    authed: req.query?.authed,
    success: req.query?.success,
    already_added: req.query?.already_added,
    auth_missing: Spotify.spotify.getToken() === undefined,
  });
});

app.listen(port, () => {
  console.log(`Listening at http://localhost:${port}`);
});
