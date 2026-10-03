# Deploying Dragon Craft

Dragon Craft is a fully static site (no build step, no server process). Serving it needs only nginx and the files.

## Where it can live

`gordhamer.com` itself does **not** point at this VPS (DNS sends it elsewhere), so
`gordhamer.com/dragon-craft` can't be served from here. The other apps here live on subdomains
(`temple.`, `explore.`, `describe.`), so the matching choice is **`dragon.gordhamer.com`**.

## One-time setup (needs root)

1. DNS: add an `A` record `dragon.gordhamer.com` -> this VPS's IP.
2. Install the nginx site and the TLS cert:

   ```sh
   sudo cp deploy/nginx-dragon.conf /etc/nginx/sites-available/dragon
   sudo ln -s /etc/nginx/sites-available/dragon /etc/nginx/sites-enabled/dragon
   sudo mkdir -p /var/www/dragon && sudo chown $USER /var/www/dragon
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot --nginx -d dragon.gordhamer.com
   ```

## Every deploy

```sh
./deploy/deploy.sh
```

Copies only the public game files into `/var/www/dragon`.

## Multiplayer server (needs root, once)

```sh
sudo ./deploy/mp-setup.sh
```

Installs the `dragon-mp` systemd service (a small Node process on 127.0.0.1:8787, edits stored in `/var/lib/dragon-craft`)
and adds the `/ws` proxy to the nginx site. The static deploy above is still just `./deploy/deploy.sh`.
