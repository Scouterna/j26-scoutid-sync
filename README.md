<div>
  <img align="right" width="80" src="./docs/jamboree26_logo_small_dark.png#gh-dark-mode-only" alt="Jamboree26 Logo">
  <img align="right" width="80" src="./docs/jamboree26_logo_small_light.png#gh-light-mode-only" alt="Jamboree26 Logo">

  <br />
  <br />
  <h1>Jamboree26 ScoutID Sync</h1>
</div>

This is a tool to assign users in ScoutID to the correct groups based on their
registrations for Jamboree26. It's meant to be run as a scheduled job.

## Usage

Copy the `.env.example` file to `.env` and fill in the required environment
variables. Create a `config.yml` file based on the `config.example.yml` file and
set it up as you wish.

Then, you can run the tool using Docker:
```bash
docker run \
  --env-file .env \
  --mount type=bind,src=./config.yml,dst=/app/config.yml \
  ghcr.io/scouterna/j26-scoutid-sync
```
