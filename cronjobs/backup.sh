#!/bin/sh

BACKUP_DIR=/backups
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME=appdb_${DATE}
BACKUP_FILE="${BACKUP_DIR}/${BACKUP_NAME}.sql.gz"
REGION="us-lax-1"
BUCKET="mortgage-calculator-backups"

echo "Cleaning up old backups from volume (keep if < 7 days old)..."
find "$BACKUP_DIR" -type f -mtime +7 -name "appdb_*.sql.gz" -exec rm {} \;

mkdir -p "$BACKUP_DIR"
PGPASSWORD=$POSTGRES_PASSWORD pg_dump \
    -h $POSTGRES_HOST \
    -U $POSTGRES_USER \
    -d $POSTGRES_DB \
    | gzip > "$BACKUP_FILE"

echo "Backup created in volume: $BACKUP_FILE"
ls -lh $BACKUP_FILE

echo "Uploading backup to Linode..."
PAYLOAD=$(cat <<EOF
{
    "expires_in": 600,
    "method": "PUT",
    "name": "${BACKUP_NAME}.sql.gz",
    "content_type": "application/gzip"
}
EOF
)
PUT_OBJECT_URL=$(curl --silent --request POST \
  --url "https://api.linode.com/v4/object-storage/buckets/${REGION}/${BUCKET}/object-url" \
  --header "accept: application/json" \
  --header "authorization: Bearer ${LINODE_PAT}" \
  --header "content-type: application/json" \
  --data "$PAYLOAD" \
  | jq -r .url
)
HTTP_STATUS=$(curl --silent --request PUT \
    --url "$PUT_OBJECT_URL" \
    --header "Content-Type: application/gzip" \
    --upload-file $BACKUP_FILE \
    --write-out "%{http_code}" \
)
echo $HTTP_STATUS

echo "Cleaning up old backups from Linode (keep 7 latest)..."
curl --silent --request GET \
    --url "https://api.linode.com/v4/object-storage/buckets/${REGION}/${BUCKET}/object-list?page_size=100" \
    --header "accept: application/json" \
    --header "authorization: Bearer ${LINODE_PAT}" \
    | jq -r '
        .data
        | map(select(.name | startswith("appdb_") and endswith(".sql.gz")))
        | sort_by(.last_modified)
        | reverse
        | .[7:]
        | .[] .name
    ' \
    | while IFS= read -r backup; do
        [ -z "$backup" ] && continue
        echo "Deleting ${backup}..."
        PAYLOAD="{\"expires_in\": 600,\"method\": \"DELETE\",\"name\": \"${backup}\"}"
        DELETE_OBJECT_URL=$(curl --silent --request POST \
            --url "https://api.linode.com/v4/object-storage/buckets/${REGION}/${BUCKET}/object-url" \
            --header "accept: application/json" \
            --header "authorization: Bearer ${LINODE_PAT}" \
            --header "content-type: application/json" \
            --data "$PAYLOAD" \
            | jq -r .url
        )
        HTTP_STATUS=$(curl --silent --request DELETE \
            --url "$DELETE_OBJECT_URL" \
            --write-out "%{http_code}" \
        )
        echo $HTTP_STATUS
done

echo "Done"
echo "----------------------------------------"
exit 0
