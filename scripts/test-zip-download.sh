#!/bin/bash

# Test script for ZIP download functionality
# Usage: ./scripts/test-zip-download.sh <galleryId> <orderId> [apiUrl] [token]

set -e

GALLERY_ID="${1:-}"
ORDER_ID="${2:-}"
API_URL="${3:-${API_URL:-http://localhost:3000/api}}"
TOKEN="${4:-${AUTH_TOKEN:-}}"

if [ -z "$GALLERY_ID" ] || [ -z "$ORDER_ID" ]; then
  echo "Usage: $0 <galleryId> <orderId> [apiUrl] [token]"
  echo ""
  echo "Example:"
  echo "  $0 gal_123 order_456 https://api.example.com eyJhbGc..."
  exit 1
fi

if [ -z "$TOKEN" ]; then
  echo "Error: AUTH_TOKEN environment variable or token argument required"
  exit 1
fi

echo "Testing ZIP download for:"
echo "  Gallery ID: $GALLERY_ID"
echo "  Order ID: $ORDER_ID"
echo "  API URL: $API_URL"
echo ""

# Function to make API request
make_request() {
  curl -s -X POST \
    "${API_URL}/galleries/${GALLERY_ID}/orders/${ORDER_ID}/final/zip" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -w "\nHTTP_CODE:%{http_code}\n"
}

# Start timing
START_TIME=$(date +%s)

echo "Requesting ZIP download..."
RESPONSE=$(make_request)
HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_CODE/d')

echo "Response:"
echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
echo ""

# Check if ZIP is ready or generating
if echo "$BODY" | jq -e '.url' > /dev/null 2>&1; then
  URL=$(echo "$BODY" | jq -r '.url')
  FILENAME=$(echo "$BODY" | jq -r '.filename // "download.zip"')
  SIZE=$(echo "$BODY" | jq -r '.size // 0')
  
  ELAPSED=$(($(date +%s) - START_TIME))
  
  echo "✅ ZIP ready immediately!"
  echo "  URL: $URL"
  echo "  Filename: $FILENAME"
  echo "  Size: $(numfmt --to=iec-i --suffix=B $SIZE 2>/dev/null || echo "${SIZE} bytes")"
  echo "  Time: ${ELAPSED}s"
  echo ""
  echo "To download:"
  echo "  curl -o '$FILENAME' '$URL'"
  
elif echo "$BODY" | jq -e '.status == "generating"' > /dev/null 2>&1; then
  echo "⏳ ZIP is generating, polling for completion..."
  echo ""
  
  POLL_COUNT=0
  MAX_POLLS=450  # 15 minutes max (450 * 2 seconds)
  
  while [ $POLL_COUNT -lt $MAX_POLLS ]; do
    sleep 2
    POLL_COUNT=$((POLL_COUNT + 1))
    
    RESPONSE=$(make_request)
    HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
    BODY=$(echo "$RESPONSE" | sed '/HTTP_CODE/d')
    
    if echo "$BODY" | jq -e '.url' > /dev/null 2>&1; then
      URL=$(echo "$BODY" | jq -r '.url')
      FILENAME=$(echo "$BODY" | jq -r '.filename // "download.zip"')
      SIZE=$(echo "$BODY" | jq -r '.size // 0')
      
      ELAPSED=$(($(date +%s) - START_TIME))
      
      echo "✅ ZIP ready!"
      echo "  URL: $URL"
      echo "  Filename: $FILENAME"
      echo "  Size: $(numfmt --to=iec-i --suffix=B $SIZE 2>/dev/null || echo "${SIZE} bytes")"
      echo "  Total time: ${ELAPSED}s"
      echo "  Polls: $POLL_COUNT"
      echo ""
      echo "To download:"
      echo "  curl -o '$FILENAME' '$URL'"
      exit 0
    fi
    
    if [ $((POLL_COUNT % 10)) -eq 0 ]; then
      ELAPSED=$(($(date +%s) - START_TIME))
      echo "  Still generating... (${ELAPSED}s elapsed, ${POLL_COUNT} polls)"
    fi
  done
  
  echo "❌ Timeout: ZIP did not complete within 15 minutes"
  exit 1
  
else
  echo "❌ Error:"
  echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
  exit 1
fi

