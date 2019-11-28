with open('ids.txt', 'r') as f:
    ids = f.readlines()

ids = [id.strip() for id in ids]

array = ['{"parcel_id":' + id + ',"classification_results":[{"crop_id":717,"probability":0.97},{"crop_id":715,"probability":0.13},{"crop_id":771,"probability":0.05}]}'
for id in ids]

with open('../geodata/classification_results.json', 'w') as f:
    f.write('[' + ','.join(array) + ']')
