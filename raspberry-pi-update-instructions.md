# How to Update Your Raspberry Pi

These instructions will walk you through connecting to the Raspberry Pi from your Mac and running the update script. You only need to do this from your home Wi-Fi network (the Pi needs to be plugged in and turned on).

---

## Step 1 — Open Terminal

1. Press **Command (⌘) + Space** to open Spotlight Search
2. Type `Terminal` and press **Return**
3. A window with a black or white background and a text prompt will appear — that's Terminal

---

## Step 2 — Connect to the Raspberry Pi

Type the following command exactly and press **Return**:

```
ssh pi@fullpageos.local
```

**The first time you connect**, you'll see a message like:

> Are you sure you want to continue connecting (yes/no/[fingerprint])?

Type `yes` and press **Return**.

Then it will ask for a password:

```
pi@fullpageos.local's password:
```

Type the password: `raspberry`

> **Note:** As you type the password, nothing will appear on screen — that's normal. Just type it and press **Return**.

You're connected when you see a prompt that looks something like:
```
pi@fullpageos:~ $
```

---

## Step 3 — Run the Update Script

Type the following and press **Return**:

```
bash scripts/update.sh
```

You'll see text scrolling by as the update runs. Wait for it to finish — it may take a minute or two. You'll know it's done when you see the prompt (`pi@fullpageos:~ $`) appear again.

---

## Step 4 — Disconnect

When the update is done, type the following and press **Return**:

```
exit
```

You can now close the Terminal window.

---

## Troubleshooting

**"Could not resolve hostname fullpageos.local"**
Make sure your Mac and the Raspberry Pi are connected to the same Wi-Fi network.

**"Connection refused" or "Connection timed out"**
The Pi may not be on or fully booted yet. Wait a minute and try again.

**Password not working**
Make sure Caps Lock is off and type the password carefully: `raspberry`
