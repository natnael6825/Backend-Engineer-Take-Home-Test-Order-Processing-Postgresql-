$baseUrl = "http://localhost:3000"

Write-Host "Create business" -ForegroundColor Cyan
curl.exe -s -X POST "$baseUrl/api/businesses" -H "Content-Type: application/json" -d '{"name":"Acme Supply Co","creditLimitCents":500000}'

Write-Host "Create product" -ForegroundColor Cyan
curl.exe -s -X POST "$baseUrl/api/products" -H "Content-Type: application/json" -d '{"businessId":"7d8f8c6b-5d2f-4e0a-9c1a-1d4f2c7a3b11","sku":"SKU-NEW-01","name":"New Widget","stock":25,"priceCents":1200}'

Write-Host "Update product" -ForegroundColor Cyan
curl.exe -s -X PATCH "$baseUrl/api/products/3e5a9b2c-1d4f-4b7a-8c9d-1e2f3a4b5c6d" -H "Content-Type: application/json" -d '{"businessId":"7d8f8c6b-5d2f-4e0a-9c1a-1d4f2c7a3b11","stock":90,"priceCents":1600}'

$idempotencyKey = [guid]::NewGuid().ToString()
Write-Host "Purchase" -ForegroundColor Cyan
curl.exe -s -X POST "$baseUrl/api/purchase" -H "Content-Type: application/json" -d "{\"businessId\":\"7d8f8c6b-5d2f-4e0a-9c1a-1d4f2c7a3b11\",\"idempotencyKey\":\"$idempotencyKey\",\"items\":[{\"product_id\":\"3e5a9b2c-1d4f-4b7a-8c9d-1e2f3a4b5c6d\",\"qty\":2},{\"product_id\":\"6f7a8b9c-0d1e-4f2a-8b3c-4d5e6f7a8b9c\",\"qty\":1}]}"

Write-Host "Overdue summary" -ForegroundColor Cyan
curl.exe -s "$baseUrl/api/overdue?businessId=7d8f8c6b-5d2f-4e0a-9c1a-1d4f2c7a3b11"