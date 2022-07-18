import { readFileSync, writeFileSync, existsSync, rmSync } from 'fs';
import fetch, { RequestInit } from 'node-fetch';
import AlreadyAddedError from './errors/AlreadyAddedError.js';
import NoTokenError from './errors/NoTokenError.js';
import {
  AuthTokenProps,
  AuthTokenResponse,
  PlaylistResponse,
} from './types/index.js';

type sendRequestProps = {
  endpoint: 'api' | 'accounts';
  path: string;
  params?: RequestInit & {
    query?: URLSearchParams;
  };
  authorization?: string;
};

type stateProps = {
  playlistId: string;
  clientId: string;
  basicToken: string;
  token?: AuthTokenProps;
};

export default class Spotify {
  public static spotify: Spotify;

  private state: stateProps;
  private tracks: string[] = [];
  private refresh_token: string;
  private url: string;

  constructor() {
    if (Spotify.spotify === undefined) {
      Spotify.spotify = this;
    }

    const playlistId = process.env.PLAYLIST_ID;
    const clientId = process.env.CLIENT_ID;
    const secret = process.env.CLIENT_SECRET;
    this.url = process.env.URL;

    if (!(playlistId && clientId && secret)) {
      throw new Error('env variables missing');
    }

    const basicToken = Buffer.from(`${clientId}:${secret}`).toString('base64');
    this.state = {
      playlistId,
      clientId,
      basicToken,
    };

    if (existsSync('spotify.token')) {
      try {
        this.setToken(
          JSON.parse(
            Buffer.from(
              readFileSync('spotify.token').toString(),
              'base64'
            ).toString()
          )
        );
      } catch (e) {
        rmSync('spotify.token');
      }
    }
  }

  getToken() {
    return this.state.token;
  }

  setToken(token: AuthTokenResponse) {
    this.state.token = token;

    if (token.refresh_token) {
      this.refresh_token = token.refresh_token;
    }

    writeFileSync(
      'spotify.token',
      Buffer.from(
        JSON.stringify({
          ...this.state.token,
          refresh_token: this.refresh_token,
        })
      ).toString('base64')
    );
  }

  /**
   * @returns string authorization link for alloweing bot for user
   */
  getAuthorizationLink() {
    return `https://accounts.spotify.com/authorize?${new URLSearchParams({
      response_type: 'code',
      client_id: this.state.clientId,
      scope: 'playlist-modify-public',
      redirect_uri: `${this.url}/authorize/`,
      state: Buffer.from(Math.random().toFixed(4)).toString('hex'),
    })}`;
  }

  async searchTrack(query: string) {
    return await this.sendRequest({
      endpoint: 'api',
      path: '/search',
      params: {
        query: new URLSearchParams({
          q: query,
          type: 'track',
        }),
      },
    }).then(r => r?.tracks?.items ?? []);
  }

  /**
   * @param code authorization_code from authorization process, required on auth request
   */
  async requestToken(code?: string) {
    if (!this.state.token && !code) {
      throw new Error("Required parameter missing: 'code'");
    }

    const body = this.state.token
      ? {
          grant_type: 'refresh_token',
          refresh_token: this.refresh_token,
        }
      : {
          code,
          grant_type: 'authorization_code',
          redirect_uri: `${this.url}/authorize/`,
        };
    console.log('Request params: ', body);

    const t = await this.sendRequest({
      endpoint: 'accounts',
      path: '/api/token',
      params: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(body),
      },
      authorization: `Basic ${this.state.basicToken}`,
    }).catch(e => {
      throw e;
    });

    this.setToken(t);
  }

  /**
   * loads all tracks in a playlist
   */
  async loadPlaylist() {
    console.log('Loading playlist...');

    const mapResponse = (r: PlaylistResponse) =>
      r.items.map(item => item.track.id);

    const send = (offset: number = 0) =>
      this.sendRequest({
        endpoint: 'api',
        path: `/playlists/${this.state.playlistId}/tracks/?offset=${offset}&limit=100`,
        params: {
          method: 'GET',
        },
      }).catch(e => {
        throw e;
      });

    const first: PlaylistResponse = await send();
    this.tracks.push(...mapResponse(first));

    for (let i = 100; i < first.total; i += 100) {
      this.tracks.push(...mapResponse((await send(i)) as PlaylistResponse));
    }

    console.log(`Fetched ${this.tracks.length} tracks`);
  }

  /**
   * adds a track to the playlist
   */
  async addTrackToPlaylist(trackId: string) {
    if (this.tracks.length === 0) {
      await this.loadPlaylist().catch(e => {
        throw e;
      });
    }

    if (this.tracks.includes(trackId)) {
      throw new AlreadyAddedError();
    }

    const r = await this.sendRequest({
      endpoint: 'api',
      path: `/playlists/${this.state.playlistId}/tracks`,
      params: {
        method: 'POST',
        body: JSON.stringify({
          uris: [`spotify:track:${trackId}`],
        }),
      },
    }).catch(e => {
      throw e;
    });

    if (r?.error) {
      throw new Error(r.error.message);
    }
    this.tracks.push(trackId);
  }

  async sendRequest({
    endpoint,
    path,
    params,
    authorization,
  }: sendRequestProps) {
    if (endpoint === 'api' && !this.state.token) {
      throw new NoTokenError(this.getAuthorizationLink());
    }

    const url = `https://${endpoint}.spotify.com${
      endpoint === 'api' ? '/v1' : ''
    }${path}${params?.query ? `?${params?.query?.toString()}` : ''}`;

    const init = () => ({
      ...params,
      headers: {
        ...params?.headers,
        Authorization:
          authorization ??
          `${this.state.token?.token_type} ${this.state.token?.access_token}`,
      },
    });

    console.log(`${params?.method ?? 'GET'} - ${url}`);

    const send = (): Promise<Error | any> =>
      fetch(url, init())
        .then(r => {
          const content = r.headers.get('Content-Type');
          if (content.match(/application\/json/)) {
            return r.json();
          }
          return r;
        })
        .catch(r => {
          console.error(r);
          return new Error(r);
        });

    let r: Error | any;

    for (let i = 0; i < 2; i++) {
      r = await send();

      if (r instanceof Error) {
        throw r;
      } else if (r?.error) {
        switch (r.error.status) {
          case 401:
            await this.requestToken().catch(e => {
              throw e;
            });
            break;
          default:
            throw new Error(r.error.message);
        }
      } else {
        return r;
      }
    }
  }
}
