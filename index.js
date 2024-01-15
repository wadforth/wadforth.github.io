// Add this function for handling AbuseIPDB API request
async function checkAbuseIP(ip) {
    const apiKey = 'bc2656b224800e06e541edb8499ef3e0d4236e51e5a750a0696c4da55f6efbafc82ac4eebfff0eac';
    const apiUrl = `https://api.abuseipdb.com/api/v2/check?ipAddress=${ip}`;
    
    try {
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'Key': apiKey,
                'Accept': 'application/json'
            }
        });

        if (response.ok) {
            const data = await response.json();
            // Process the data as needed (you can customize this part)
            return data;
        } else {
            console.error('Error checking AbuseIPDB:', response.statusText);
            return null;
        }
    } catch (error) {
        console.error('Error checking AbuseIPDB:', error.message);
        return null;
    }
}

// Add this function for handling the Import List modal
function openImportListModal() {
    const importListModal = new bootstrap.Modal(document.getElementById('importListModal'));
    const textArea = document.getElementById('iocListTextarea');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const submitButton = document.getElementById('submitImportList');

    // Clear previous values
    textArea.value = '';
    progressBar.style.width = '0%';
    progressText.textContent = '';

    importListModal.show();

    submitButton.onclick = async () => {
        const iocList = textArea.value.split('\n').filter(ip => ip.trim() !== '');

        for (let i = 0; i < iocList.length; i++) {
            const ip = iocList[i].trim();
            const result = await checkAbuseIP(ip);

            // Process the result as needed (you can customize this part)

            // Update progress bar
            const progress = ((i + 1) / iocList.length) * 100;
            progressBar.style.width = `${progress}%`;
            progressText.textContent = `Processing ${i + 1} of ${iocList.length} IPs`;

            // Add the data to ip_data.txt (you can customize this part)
            if (result) {
                const newData = `${result.data.ipAddress},${result.data.isPublic},${result.data.abuseConfidenceScore}\n`;
                // Append the data to ip_data.txt
                // You can use a server-side language for file handling in a production environment
                // Here, we're using a placeholder for demonstration purposes
                console.log(newData);
            }
        }

        // Close the modal after processing
        importListModal.hide();
    };
}

document.addEventListener("DOMContentLoaded", function () {
    const searchInput = document.getElementById("searchInput");
    const tableHeaders = document.getElementById("tableHeaders");
    const dataTableBody = document.getElementById("dataTableBody");
    const buttonsContainer = document.querySelector(".buttons-container");
    const buttonsContainerUnderTable = document.querySelector(".buttons-container-under-table");
    const importListButton = document.getElementById('importListButton');
    const importListModal = new bootstrap.Modal(document.getElementById('importListModal'));
    const textArea = document.getElementById('iocListTextarea');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const submitImportListButton = document.getElementById('submitImportList');

    // Variable to store the currently loaded data file
    let loadedDataFile = 'ip_data.txt';

    function updateTable(searchTerm) {
        fetch(loadedDataFile)
            .then(response => response.text())
            .then(data => {
                const parsedData = parseCSV(data);
                const headerRow = parsedData[0];
                const filteredData = parsedData.filter((row, index) => {
                    // Exclude header row when searching
                    if (index === 0) return false;

                    // Check if any column contains the search term
                    return row.some(cell => cell.toLowerCase().includes(searchTerm.toLowerCase()));
                });

                // Display the original column headers
                displayData([headerRow, ...filteredData]);
                updateButtons();
            })
            .catch(error => console.error('Error fetching data:', error));
    }

    function checkAbuseIP(ip, callback) {
        const apiKey = 'your_api_key'; // Replace with your AbuseIPDB API key
        const apiUrl = `https://api.abuseipdb.com/api/v2/check?ipAddress=${ip}&jsonCallback=jsonpCallback`;
    
        // Create a unique callback function for each request
        const callbackName = 'jsonpCallback_' + Date.now();
        window[callbackName] = (data) => {
            // Extract the data under the "report" field if present
            const reportData = data && data.report ? data.report : data;
            callback(reportData);
        };
    
        // Create a script element to make the JSONP request
        const script = document.createElement('script');
        script.src = apiUrl + `&callback=${callbackName}`;
        document.head.appendChild(script);
    
        // Remove the script element after the request completes
        script.onload = () => {
            document.head.removeChild(script);
            delete window[callbackName];
        };
    
        // Handle errors
        script.onerror = (error) => {
            console.error('Error checking AbuseIPDB:', error);
            document.head.removeChild(script);
            delete window[callbackName];
        };
    }

    // Function to display data in the table
    function displayData(data) {
        // Check if tableHeaders and dataTableBody are defined
        if (!tableHeaders || !dataTableBody) {
            console.error('Error: tableHeaders or dataTableBody is null or undefined.');
            return;
        }

        // Clear previous content
        tableHeaders.innerHTML = "";
        dataTableBody.innerHTML = "";

        // Display table headers
        const headerRow = document.createElement("tr");
        data[0].forEach(header => {
            const th = document.createElement("th");
            th.textContent = header;
            headerRow.appendChild(th);
        });
        tableHeaders.appendChild(headerRow);

        // Display table data
        for (let i = 1; i < Math.min(data.length, 21); i++) {
            const dataRow = document.createElement("tr");
            data[i].forEach(cell => {
                const td = document.createElement("td");
                td.textContent = cell;
                dataRow.appendChild(td);
            });
            dataTableBody.appendChild(dataRow);
        }

        // Display pagination buttons
        const paginationContainer = document.querySelector(".pagination-container ul");
        if (paginationContainer) {
            paginationContainer.innerHTML = "";
            const totalPages = Math.ceil(data.length / 20);
            for (let i = 1; i <= totalPages; i++) {
                const li = document.createElement("li");
                li.classList.add("page-item");
                const a = document.createElement("a");
                a.classList.add("page-link");
                a.textContent = i;
                a.addEventListener("click", () => displayDataPage(data, i));
                li.appendChild(a);
                paginationContainer.appendChild(li);
            }
        } else {
            console.error('Error: paginationContainer is null or undefined.');
        }

        // Display buttons under the table
        if (buttonsContainerUnderTable && buttonsContainer) {
            buttonsContainerUnderTable.innerHTML = buttonsContainer.innerHTML;
        } else {
            console.error('Error: buttonsContainerUnderTable or buttonsContainer is null or undefined.');
        }
    }

    // Function to display a specific page of data
    function displayDataPage(data, pageNumber) {
        const start = (pageNumber - 1) * 20 + 1;
        const end = start + 19;
        const slicedData = data.slice(start, end + 1);
        displayData(slicedData);
    }

    // Function to parse CSV data
    function parseCSV(csv) {
        const lines = csv.trim().split('\n');
        return lines.map(line => line.split(','));
    }

    // Function to handle file appending using File System API
    async function appendToFile(fileName, data) {
        try {
            const fileHandle = await window.showOpenFilePicker();
            const file = await fileHandle.getFile();
            const writable = await file.createWritable();
            await writable.write(data);
            await writable.close();
            console.log('Data appended to file successfully.');
        } catch (error) {
            console.error('Error appending data to file:', error);
        }
    }

    // Function to handle Import List modal
    function openImportListModal() {
        // Clear previous values
        textArea.value = '';
        progressBar.style.width = '0%';
        progressText.textContent = '';

        importListModal.show();

        submitImportListButton.onclick = async () => {
            const iocList = textArea.value.split('\n').filter(ip => ip.trim() !== '');

            for (let i = 0; i < iocList.length; i++) {
                const ip = iocList[i].trim();
                const result = await checkAbuseIP(ip);

                // Process the result as needed (you can customize this part)

                // Update progress bar
                const progress = ((i + 1) / iocList.length) * 100;
                progressBar.style.width = `${progress}%`;
                progressText.textContent = `Processing ${i + 1} of ${iocList.length} IPs`;

                // Append the data to the file using the File System API
                if (result) {
                    const newData = `${result.data.ipAddress},${result.data.isPublic},${result.data.abuseConfidenceScore}\n`;
                    await appendToFile('ip_data.txt', newData);
                }
            }

            // Close the modal after processing
            importListModal.hide();
        };
    }

    // Add input event listener for the search input
    searchInput.addEventListener("input", function () {
        updateTable(this.value);
    });

    // Initial display of data
    updateTable('');

    // Event listener for Import List button
    if (importListButton) {
        importListButton.addEventListener('click', openImportListModal);
    }
});