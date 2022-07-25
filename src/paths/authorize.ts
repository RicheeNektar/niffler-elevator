import { Application, Request, Response } from 'express/ts4.0';
import Spotify from '../spotify/index.js';

const get = (req: Request, res: Response) => {
  if (Spotify.spotify.getToken() !== undefined) {
    return res.sendStatus(401);
  }

  const code = req.query?.code;

  if (typeof code !== 'string') {
    return res.redirect('/');
  }

  return res.render('authorize.pug', {
    code,
  });
};

const post = (req: Request, res: Response) => {
  const playlist = req.body?.playlist;
  const code = req.body?.code;

  if (code === undefined) {
    return res.redirect('/');
  }

  if (playlist === undefined) {
    return res.render('authorize.pug', {
      invalid: true,
    });
  }

  const matches = playlist.match(
    /^https?:\/\/open\.spotify\.com\/playlist\/(?<trackId>[^\?]+)/
  );

  if (!matches) {
    return res.render('authorize.pug', {
      invalid: true,
    });
  }

  Spotify.spotify.setPlaylistId(matches.groups.trackId);

  Spotify.spotify
    .requestToken(code)
    .then(() =>
      Spotify.spotify.fetchPlaylistInfo().then(() => res.redirect('/?authed=1')).catch(console.error)
    )
    .catch(r => {
      console.error(r);
      res.sendStatus(500);
    });
};

const register = (app: Application) => {
  app.get('/authorize', get);
  app.post('/authorize', post);
};

export default register;
