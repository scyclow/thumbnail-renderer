# On-Chain NFT Thumbnail Renderer
## Start
- `npm i`
- `touch .env`
- Create kets for infura & nft.storage, and set them in your `.env` like so:
## .env
```
NFT_STORAGE_KEY="..."
INFURA_KEY="..."
```
- `npm start`
- Go to `http://localhost:5555/render/<TOKEN_ID>`
- The first load should render a thumbnail + upload it to nft.storage, whereas subsequent uploads should pull from the cache
- Restarting the dev server will invalidate the cache

## TODO
- Use aspect ratio stored in contract instead of assuming 1.0
- Replace the cache with a real cache that will persist when the server goes down