export type AuthTokenProps = {
  token_type: string;
  access_token: string;
  expires_in: number; // seconds
};

export type ApiAuthTokenProps = AuthTokenProps & {
  refresh_token: string;
  scope: string;
}

export type Track = {
  name: string;
  id: string;
  uri: string;
};

export type PlaylistTrack = {
  track: Track;
};

export type PlaylistResponse = {
  items: PlaylistTrack[];
  total: number;
};

export type PlaylistProps = {
  name: string;
};
