import { Application, Request, Response } from 'express/ts4.0';
import AlreadyAddedError from '../spotify/errors/AlreadyAddedError.js';
import NoTokenError from '../spotify/errors/NoTokenError.js';
import Spotify from '../spotify/index.js';

const Submit = (request: Request, response: Response) => {
  const link: string = request.body?.spotify_link;

  const matches = link.match(
    /^https?:\/\/open\.spotify\.com\/track\/(?<trackId>[^\?]+)/
  );

  if (!matches) {
    return response.redirect('/');
  }

  const trackId: string = matches.groups.trackId;

  console.log('Adding track ' + trackId);

  Spotify.spotify
    .addTrackToPlaylist(trackId)
    .then(() => {
      response.redirect('/?success=1');
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
  app.post('/submit', Submit);
};

export default register;
