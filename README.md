## Convert CSV to JSON

### POST /convert

แปลงไฟล์ CSV เป็น JSON Array

#### Request

- Form Data:
  - csvFile (File) : ไฟล์ CSV

#### Response

```json
{
  "data": [
    {"column1": "value1", "column2": "value2"},
    {"column1": "value3", "column2": "value4"}
  ]
}
