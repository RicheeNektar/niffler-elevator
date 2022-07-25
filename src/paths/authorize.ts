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

  res.render('authorize.pug', {
    code,
  });
};

const post = (req: Request, res: Response) => {
  const pass = req.body?.password;
  const code = req.body?.code;

  if (pass === undefined || code === undefined) {
    return res.redirect('/?error=1');
  }

  Spotify.spotify
    .requestToken(code)
    .then(() => {
      res.redirect('/?authed=1');
    })
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
