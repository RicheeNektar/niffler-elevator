import { Application, Request, Response } from 'express/ts4.0';
import AlreadyAddedError from '../spotify/errors/AlreadyAddedError.js';
import NoTokenError from '../spotify/errors/NoTokenError.js';
import Spotify from '../spotify/index.js';

const search = (request: Request, response: Response) => {
  if (request.method === 'GET') {
    return response.render('search.pug');
  }

  if (!request.body.query) {
    return response.render('search.pug', {
      query_invalid: true,
    });
  }

  Spotify.spotify
    .searchTrack(request.body.query)
    .then(tracks => {
      response.render('search.pug', {
        tracks,
      });
    })
    .catch(e => {
      if (e instanceof NoTokenError) {
        return response.redirect(e.getAuthLink());
      } else if (e instanceof AlreadyAddedError) {
        return response.redirect('/?already_added=1');
      }
      response.sendStatus(500);
      console.error(e);
    });
};

const register = (app: Application) => {
  app.get('/search', search);
  app.post('/search', search);
};

export default register;
