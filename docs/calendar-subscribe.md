# Subscribing to Your Family Calendar

Family Private Class Tracker provides an **ICS feed** that lets you see all your lessons in Google Calendar, Apple Calendar, Outlook, or any app that supports iCalendar subscriptions.

## 1. Generate Your Calendar URL

1. Open the app (web or mobile).
2. Go to **Account** (web) or the **Home** screen (mobile).
3. Click/tap **Generate Calendar URL**.
4. Copy the URL shown. It looks like:
   ```
   https://your-api.example.com/calendar/<householdId>.ics?token=<secret>
   ```

> **Keep this URL private.** Anyone with the link can see your lesson schedule. If you suspect it was shared, click **Regenerate URL** — the old link will stop working immediately.

## 2. Subscribe in Google Calendar

1. Open [Google Calendar](https://calendar.google.com) on desktop.
2. On the left sidebar, click **+** next to "Other calendars".
3. Select **From URL**.
4. Paste your calendar URL.
5. Click **Add calendar**.

Google refreshes subscribed calendars roughly every 12–24 hours. Changes to lessons may take a day to appear.

## 3. Subscribe in Apple Calendar (macOS / iOS)

### macOS
1. Open **Calendar.app**.
2. Go to **File → New Calendar Subscription…**
3. Paste your calendar URL and click **Subscribe**.
4. Choose a name, color, and auto-refresh interval (every hour recommended).

### iOS / iPadOS
1. Open **Settings → Calendar → Accounts → Add Account → Other**.
2. Tap **Add Subscribed Calendar**.
3. Paste your calendar URL and tap **Next**.
4. Adjust the description and tap **Save**.

Apple Calendar refreshes subscribed calendars based on the interval you choose (default is weekly; set to hourly for faster updates).

## 4. Subscribe in Outlook

1. Open [Outlook on the web](https://outlook.live.com/calendar).
2. Click **Add calendar** → **Subscribe from web**.
3. Paste your URL, set a name and color.
4. Click **Import**.

Outlook refreshes every few hours.

## Regenerating the URL

If you regenerate the token, the old URL immediately stops working. You'll need to re-subscribe in each calendar app with the new URL.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Calendar shows no events | Make sure lessons exist. The feed covers 1 month back to 6 months ahead. |
| Events are stale | External calendars cache feeds. Wait for the next refresh cycle, or remove and re-add the subscription. |
| "Not found" error | The token may have been regenerated. Copy the new URL from the app. |
| Times look wrong | All times are in UTC. Your calendar app should convert to your local timezone. |
