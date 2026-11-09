# Finance Tracker setup

The app is a static website hosted free on GitHub Pages. Your data is stored in your own free Firebase project, and only your Google account can read or write it.

You only need to do this once. It takes about 15 minutes.

## 1. Create the Firebase project

1. Go to https://console.firebase.google.com and sign in with your Google account.
2. Click **Create a project** (or **Add project**). Name it something like `finance-tracker`. You can turn Google Analytics off.
3. In the left menu open **Authentication** (under **Build** or **Security**, depending on your console) and click **Get started**. Under **Sign-in method** choose **Google**, turn it on, pick your email as the support email and save.
4. Open **Databases & Storage > Firestore** and click **Create database**. Choose the location `australia-southeast1 (Sydney)` and **production mode**.
5. Still in Firestore, open the **Rules** tab along the top (it appears once the database exists). Replace everything there with the contents of `firestore.rules` from this folder and click **Publish**.
6. Click the gear icon next to **Project Overview**, then **Project settings**. Under **Your apps** click the web icon `</>`, give it a nickname and register it (you don't need Firebase Hosting).
7. Firebase shows a `firebaseConfig` block. Copy the `apiKey`, `authDomain`, `projectId` and `appId` values into `js/firebase-config.js`, replacing the PASTE placeholders.

These config values are not secret. They only say which project to use. Your data is protected by the sign-in and the rules.

## 2. Put the app on GitHub Pages

1. On GitHub create a new **public** repository, for example `finance-tracker`. (GitHub Pages is free for public repositories. The code is visible but your data is not in it.)
2. Upload everything in this folder: `index.html`, `css`, `js`, `img`, `tests`, `firestore.rules`, `SETUP.md` and `.gitignore`. Never upload your data `.json` files. The `.gitignore` blocks the usual file names if you use Git.
3. In the repository open **Settings > Pages**. Under **Build and deployment** choose **Deploy from a branch**, branch `main`, folder `/ (root)`, and save.
4. After a minute the site is live at `https://YOUR-GITHUB-NAME.github.io/finance-tracker/`.

## 3. Allow sign-in from your site

In Firebase open **Authentication > Settings > Authorized domains**, click **Add domain** and add `YOUR-GITHUB-NAME.github.io`.

## 4. Move your data in

1. Open the site and click **Sign in with Google**.
2. Click **Import** (bottom of the sidebar, or the row under the tabs on a phone) and pick your OneDrive data file. You can select your archived year files at the same time. Each file goes into its own year.
3. Check everything looks right. The year picker switches between years.

From then on the app saves to your account automatically. **Backup** downloads the year on screen as an Excel file you can open and read, so you can keep copies in OneDrive. **Import** restores those Excel backups (and still accepts the older JSON files). Changes made to a backup in Excel aren't imported.

## Optional: lock the project to your account

The rules already stop anyone seeing your data. Anyone else who signs in would only get their own empty space in your project. To block other accounts completely, change both `request.auth.uid == uid` conditions in `firestore.rules` to

```
request.auth.uid == uid && request.auth.token.email == "you@gmail.com"
```

then publish the rules again.

## Updating the app later

Upload the changed files to the GitHub repository. Pages updates within a minute or two. Refresh the site (Ctrl+F5 if it still shows the old version).

## Running it on your computer

Google sign-in doesn't work from a file opened directly. Serve the folder instead, for example `python -m http.server 8000`, then open `http://localhost:8000`. `localhost` is allowed by Firebase by default.

## Tests

Run `node tests/run-tests.js` from this folder. They use made-up data and a fake database, with no network.

## Free limits

Firebase's free plan includes 1 GiB of storage, 50,000 reads and 20,000 writes a day. This app uses a tiny fraction of that. Each financial year must stay under 1 MB, and the app warns you if it doesn't.
