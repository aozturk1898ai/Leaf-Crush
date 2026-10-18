/* Leaf Crush - launch configuration.
   The one file to fill in for go-live. Nothing else needs editing; rank and
   the rewarded seam read these values when they run and fall back to their
   offline behavior while a value stays null.

   1) The ladder. Deploy server/ladder-worker.mjs (see server/README.md),
      then paste the worker's URL here. The bearer token is the shared
      secret you set with `wrangler secret put TOKEN`; leave null to run
      the endpoint open.

         LeafRank.config.endpoint = 'https://leafcrush-ladder.YOURNAME.workers.dev/ladder';
         LeafRank.config.token = null;    // or the same string the worker keeps

   2) Rewarded spots - pick ONE of the two styles, leave the other null:

      a) Google H5 Games Ads (recommended on Android: works on the web and
         inside the packaged TWA). Enroll the site at AdSense (H5 Games
         Ads), then:

             LeafH5Ads.config.enabled = true;
             LeafH5Ads.config.twa = true;    // only inside the packaged build
             LeafH5Ads.activate();

      b) Your own rewarded endpoint. It receives a POST with
         { placement } plus the bearer, and answers { ok: true } on payout:

             LeafAds.config.endpoint = 'https://your-host/ads/rewarded';
             LeafAds.config.appToken = 'app-token';

   With everything below left as-is the game plays the offline ladder and
   the mock ad spot. */
LeafRank.config.endpoint = null;
LeafRank.config.token = null;

LeafH5Ads.config.enabled = false;
LeafH5Ads.config.twa = false;
LeafH5Ads.activate();

LeafAds.config.endpoint = null;
LeafAds.config.appToken = null;
