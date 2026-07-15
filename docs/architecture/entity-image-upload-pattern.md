# Entity image upload pattern

Use `EntityImageUpload` for entity-scoped image uploads where an existing domain API accepts a multipart `File`.

The component owns:

- selected `File`;
- preview object URL;
- selected/uploading/success/error status;
- validation against image upload policy;
- filename announcement;
- explicit non-submit upload and clear controls;
- object URL cleanup.

The domain page owns:

- entity id;
- current persisted image URL;
- API route;
- multipart field names beyond `file`;
- permission boundary;
- local entity merge after upload;
- success/error notice copy.

Do not serialize `File` objects into settings payloads. Pass the selected `File` directly to the upload function and let that function build `FormData`.

For list uploaders, key component instances by stable entity identifiers such as location id or folder key. Do not key selected image state by array index.
