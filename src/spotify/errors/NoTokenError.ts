export default class NoTokenError {
  private authLink: string;

  constructor(authLink: string) {
    this.authLink = authLink;
  }

  getAuthLink() {
    return this.authLink
  }
}