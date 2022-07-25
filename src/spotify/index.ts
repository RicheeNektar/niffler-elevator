import { readFileSync, writeFileSync, existsSync, rmSync } from 'fs';
import fetch, { RequestInit } from 'node-fetch';
import AlreadyAddedError from './errors/AlreadyAddedError.js';
import NoTokenError from './errors/NoTokenError.js';
import {
  ApiAuthTokenProps,
  AuthTokenProps,
  PlaylistProps,
  PlaylistResponse,
} from './types/index.js';

type sendRequestProps = {
  endpoint: 'api' | 'accounts';
  path: string;
  params?: RequestInit & {
    query?: URLSearchParams;
  };
  token?: AuthTokenProps;
};

export default class Spotify {
  public static spotify: Spotify;

  private tracks: string[] = [];
  private playlistId: string;
  private clientId: string;
  private basicToken: string;
  private refresh_token: string;
  private url: string;
  private accessToken: ApiAuthTokenProps;
  private playlistInfo: PlaylistProps;

  constructor() {
    if (Spotify.spotify === undefined) {
      Spotify.spotify = this;
    }

    this.clientId = process.env.CLIENT_ID;
    this.url = process.env.URL;

    const secret = process.env.CLIENT_SECRET;

    if (!(this.clientId && secret)) {
      throw new Error('env variables missing');
    }

    this.basicToken = Buffer.from(`${this.clientId}:${secret}`).toString(
      'base64'
    );

    if (existsSync('spotify.token')) {
      try {
        const token = JSON.parse(
          Buffer.from(
            readFileSync('spotify.token').toString(),
            'base64'
          ).toString()
        );

        this.setPlaylistId(token.playlistId);
        this.setToken(token, false);

        this.fetchPlaylistInfo();
      } catch (e) {
        rmSync('spotify.token');
      }
    }
  }

  async fetchPlaylistInfo() {
    this.playlistInfo = await this.sendRequest({
      endpoint: 'api',
      path: `/playlists/${this.playlistId}`,
      params: {
        query: new URLSearchParams({
          fields: 'name',
        }),
      },
    }).catch(e => {
      throw e;
    });
  }

  setPlaylistId(playlistId: string) {
    this.playlistId = playlistId;
  }

  getPlaylistName() {
    return this.playlistInfo?.name;
  }

  getToken() {
    return this.accessToken;
  }

  setToken(token: ApiAuthTokenProps, writeFile: boolean = true) {
    this.accessToken = token;

    if (token.refresh_token) {
      this.refresh_token = token.refresh_token;
    }

    if (writeFile) {
      writeFileSync(
        'spotify.token',
        Buffer.from(
          JSON.stringify({
            ...this.accessToken,
            refresh_token: this.refresh_token,
            playlistId: this.playlistId,
          })
        ).toString('base64')
      );
    }
  }

  /**
   * @returns string authorization link for alloweing bot for user
   */
  getAuthorizationLink() {
    return `https://accounts.spotify.com/authorize?${new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      scope: 'playlist-modify-public playlist-read-collaborative',
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
    if (!this.accessToken && !code) {
      throw new Error("Required parameter missing: 'code'");
    }

    const body = this.accessToken
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
        path: `/playlists/${this.playlistId}/tracks/?offset=${offset}&limit=100`,
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
      path: `/playlists/${this.playlistId}/tracks`,
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

  async sendRequest({ endpoint, path, params }: sendRequestProps) {
    if (endpoint === 'api' && !this.accessToken) {
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
          endpoint === 'api'
            ? `${this.accessToken.token_type} ${this.accessToken.access_token}`
            : `Basic ${this.basicToken}`,
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

    for (let i = 0; i < 5; i++) {
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
          case 403:
            console.error(r.error.message);
            break;
          default:
            throw new Error(r.error.message);
        }
      } else {
        return r;
      }
    }

    throw new Error(r?.error?.message ?? 'Did not get a valid response with 5 tries.');
  }
}
