# Expired Permit Notifications

## Worker
- `sendExpiredPermitReminders` runs hourly in `Pacific/Auckland` and scans only the LIVE `permits` collection.
- Open permits with an elapsed `validTo`, `expiryDate`, or `endDate` are grouped by receiver email. The worker uses an explicit permit email first, then resolves a unique Receiver assignment by name. Date-only values expire at the end of the date in Auckland.
- One HTML summary email is sent per receiver. Successful notices are recorded against the permit expiry so a permit does not generate an email every hour; changing its expiry allows a new notice.
- The email contains the permit reference, location, days expired, and a link to the application. Values from Firestore are HTML-escaped.
- Configure the `SMTP_USER` and `SMTP_PASS` Firebase secrets before deployment. Do not put credentials in source control.

## Local Testing
The application has no DEMO mode. The local frontend still reads and writes the LIVE Firebase project, so use it for dashboard/export checks and do not create or edit permits from it during testing.

1. Install a Java runtime if one is not already available. Firebase Firestore/Pub/Sub emulators require Java:

	```powershell
	winget install --id EclipseAdoptium.Temurin.21.JDK --exact
	```

	Open a new terminal and verify it is on `PATH`:

	```powershell
	java -version
	```

2. From the repository root, build the functions:

	```powershell
	npm --prefix functions run build
	```

3. Create `functions/.secret.local` with an SMTP account/app password. Use a controlled receiver mailbox in the emulator data:

	```text
	SMTP_USER=your-smtp-user
	SMTP_PASS=your-smtp-app-password
	```

4. Start the local Functions, Firestore, and Pub/Sub emulators:

	```powershell
	firebase emulators:start --only functions,firestore,pubsub --project demo-eba-expired-notifications
	```

	The `demo-eba-expired-notifications` value is an Emulator Suite project ID only; it does not add an app mode or environment toggle. Open the Emulator Suite UI at `http://127.0.0.1:4000`. In its Firestore tab, create a document under `permits` with `status: "draft"`, an expired `endDate` (or `expiryDate` for a pump permit), `receiverEmail` set to the controlled mailbox, and a `location`. Using `draft` prevents this fixture from triggering CX issuance sync.

5. Publish an event to the local scheduled-function topic from a second PowerShell terminal to run the worker immediately:

	```powershell
	$payload = @{ messages = @(@{ data = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes('{}')) }) } | ConvertTo-Json -Compress
	Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:8085/v1/projects/demo-eba-expired-notifications/topics/firebase-schedule-sendExpiredPermitReminders-us-central1:publish' -ContentType 'application/json' -Body $payload
	```

	Check the Functions emulator logs and the controlled mailbox. The worker writes its sent-expiry marker into emulator Firestore.

6. To test the frontend locally in a third terminal:

	```powershell
	npm run dev -- --host
	```

	Open the printed Network URL on the device. Dashboard export downloads all filtered permits and supports both all data columns and the currently selected columns. The frontend remains connected to LIVE Firebase by design; only the emulator worker uses emulator Firestore.

## Future Phase: Management Summary (Not Implemented)
- Frequency: every 15 days.
- Recipients: Tommy Temple and Dietrich Truchsess.
- Aggregate open expired permits by receiver and report each receiver's outstanding count.