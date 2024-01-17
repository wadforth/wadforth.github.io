document.addEventListener("DOMContentLoaded", function () {
    const pageSelector = document.getElementById("pageSelector");
    const prevPageLink = document.getElementById("prevPage");
    const nextPageLink = document.getElementById("nextPage");
    const paginationInfo = document.getElementById("pagination-info");
    const paginationNumbers = document.getElementById("pagination-numbers");
    const totalPagesDisplay = document.getElementById("totalPagesDisplay");
    const goToPageBtn = document.getElementById("goToPageBtn");

  const resultsPerPage = 10;
  let currentPage = 1;

  async function fetchData() {
    try {
      const response = await fetch(`ip_data.txt?${new Date().getTime()}`);
      return await response.text();
    } catch (error) {
      console.error("Error fetching data:", error);
      return null;
    }
  }

  function parseCSV(csv) {
    const lines = csv.trim().split("\n");
    const headers = lines[0].split(",");
    const data = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",");
      const row = {};

      for (let j = 0; j < headers.length; j++) {
        row[headers[j].trim()] = values[j].trim(); // Trim the values
      }

      data.push(row);
    }

    return { headers, data };
  }

  function displayData(data) {
    // Clear previous content
    dataTableBody.innerHTML = "";

    // Display table data
    const startIndex = (currentPage - 1) * resultsPerPage;
    const endIndex = startIndex + resultsPerPage;

    // Define custom column names mapping to original column names
    const columnNames = {
        "IP Address": "ipAddress",
        "Is Public": "isPublic",
        "IP Version": "ipVersion",
        "Is Whitelisted": "isWhitelisted",
        "Abuse Confidence Score": "abuseConfidenceScore",
        "Country Code": "countryCode",
        "Country Name": "countryName",
        "Usage Type": "usageType",
        "ISP": "isp",
        "Domain": "domain",
        "Hostnames": "hostnames",
        "Is Tor": "isTor",
        "Total Reports": "totalReports",
        "Distinct Users": "numDistinctUsers",
        "Last Reported At": "lastReportedAt",
        // Add more columns as needed
        // For example, add columns from the "reports" array
        "Reported At": "reports[0].reportedAt",
        "Comment": "reports[0].comment",
        "Categories": "reports[0].categories",
        "Reporter ID": "reports[0].reporterId",
        "Reporter Country Code": "reports[0].reporterCountryCode",
        "Reporter Country Name": "reports[0].reporterCountryName",
      };

    for (let i = startIndex; i < endIndex && i < data.length; i++) {
      const row = data[i];
      const dataRow = document.createElement("tr");

      // Apply formatting based on custom column names
      for (const customColumnName in columnNames) {
        const originalColumnName = columnNames[customColumnName];
        const td = document.createElement("td");

        switch (customColumnName) {
          case "IP Address":
            td.innerHTML = `<a href="https://www.abuseipdb.com/check/${row[originalColumnName]}" target="_blank" rel="noopener noreferrer"><strong>${row[originalColumnName]}</strong></a>`;
            break;
          case "Public IP":
            td.innerHTML =
              row[originalColumnName] === "True"
                ? `<strong style="color: red;">${row[originalColumnName]}</strong>`
                : `<strong style="color: green;">${row[originalColumnName]}</strong>`;
            break;
          case "Whitelisted":
            td.innerHTML =
              row[originalColumnName] === "True"
                ? `<strong style="color: green;" title="Had none value in API">&#x1F914;</strong>`
                : `<strong style="color: red;">${row[originalColumnName]}</strong>`;
            break;
          case "Country Code":
            const countryCode = row[originalColumnName];
            const dangerousCountryCodes = ["RU", "CN", "KP", "IR", "SY"]; // Add your list of dangerous country codes
            const isDangerous = dangerousCountryCodes.includes(countryCode);

            // Highlight dangerous country codes in red with flame emoji
            if (isDangerous) {
              td.innerHTML = `<strong style="color: red;">${countryCode} 🔥</strong>`;
            } else {
              td.textContent = countryCode;
            }
            break;
          case "Abuse Score":
            const abuseScore = parseFloat(row[originalColumnName]);
            if (abuseScore === 0) {
              td.innerHTML = `<strong style="color: green;">${abuseScore.toFixed(
                2
              )}%</strong>`;
            } else if (abuseScore >= 1 && abuseScore <= 50) {
              td.innerHTML = `<strong style="color: orange;">${abuseScore.toFixed(
                2
              )}%</strong>`;
            } else if (abuseScore >= 51 && abuseScore <= 99) {
              td.innerHTML = `<strong style="color: red;">${abuseScore.toFixed(
                2
              )}%</strong>`;
            } else {
              td.innerHTML = `<strong style="color: red;">${abuseScore.toFixed(
                2
              )}% &#x1F525;</strong>`;
            }
            break;
          case "Tor Related":
            td.innerHTML =
              row[originalColumnName] === "True"
                ? `<strong style="color: red;">${row[originalColumnName]}</strong>`
                : `<strong style="color: green;">${row[originalColumnName]}</strong>`;
            break;
          case "Total Reports":
            const totalReports = parseInt(row[originalColumnName]);
            if (totalReports === 0) {
              td.innerHTML = `<strong style="color: green;">${totalReports}</strong>`;
            } else if (totalReports >= 1 && totalReports <= 100) {
              td.innerHTML = `<strong style="color: orange;">${totalReports}</strong>`;
            } else {
              td.innerHTML = `<strong style="color: red;">${totalReports}</strong>`;
            }
            break;
          case "Last Reported":
            const lastReported = new Date(
              row[originalColumnName]
            ).toUTCString();
            td.textContent = lastReported;
            break;
          default:
            td.innerHTML = `<strong>${row[originalColumnName]}</strong>`;
        }

        dataRow.appendChild(td);
      }

      dataTableBody.appendChild(dataRow);
    }

   // Update pagination info
   const totalResults = data.length;
   const totalPages = Math.ceil(totalResults / resultsPerPage);
   paginationInfo.textContent = `Showing ${startIndex + 1}-${Math.min(
     endIndex,
     totalResults
   )} of ${totalResults} results`;

   // Update page selector and total pages display
   pageSelector.value = currentPage;
   totalPagesDisplay.textContent = totalPages;

   // Add dynamic pagination links (limited to 5)
   paginationNumbers.innerHTML = ""; // Clear previous content

   const maxButtons = 5;
   let startPage = Math.max(currentPage - Math.floor(maxButtons / 2), 1);
   let endPage = startPage + maxButtons - 1;

   if (endPage > totalPages) {
     endPage = totalPages;
     startPage = Math.max(endPage - maxButtons + 1, 1);
   }

   for (let i = startPage; i <= endPage; i++) {
     const pageLink = document.createElement("a");
     pageLink.href = "#";
     pageLink.classList.add("pagination-link");
     pageLink.textContent = i;
     pageLink.addEventListener("click", function (event) {
       event.preventDefault();
       currentPage = i;
       updateTable("");
     });

     paginationNumbers.appendChild(pageLink);
   }
 }

 function updatePaginationInfo(totalResults) {
   const totalPages = Math.ceil(totalResults / resultsPerPage);
   const startIndex = (currentPage - 1) * resultsPerPage + 1;
   const endIndex = Math.min(currentPage * resultsPerPage, totalResults);

   paginationInfo.textContent = `Showing ${startIndex}-${endIndex} of ${totalResults} results | Page ${currentPage} of ${totalPages}`;
 }

 async function updateTable(searchTerm) {
   try {
     const data = await fetchData();
     if (data) {
       const { data: rawData } = parseCSV(data);
       const filteredData = rawData.filter((row) => {
         return Object.values(row).some((value) =>
           value.toLowerCase().includes(searchTerm.toLowerCase())
         );
       });

       // Display paginated data
       displayData(filteredData);

       // Update pagination
       updatePaginationInfo(filteredData.length);
     }
   } catch (error) {
     console.error("Error updating table:", error);
   }
 }
 
   // Add click event listeners for previous and next page links
   prevPageLink.addEventListener("click", function (event) {
     event.preventDefault();
     if (currentPage > 1) {
       currentPage--;
       updateTable("");
     }
   });
 
   nextPageLink.addEventListener("click", function (event) {
     event.preventDefault();
     fetchData()
       .then((data) => {
         if (data) {
           const { data: rawData } = parseCSV(data);
           const totalResults = rawData.length;
           const totalPages = Math.ceil(totalResults / resultsPerPage);
 
           if (currentPage < totalPages) {
             currentPage++;
             updateTable("");
           }
         }
       })
       .catch((error) => {
         console.error("Error updating table:", error);
       });
   });
 
   // Initial display of data
   updateTable("");
 });