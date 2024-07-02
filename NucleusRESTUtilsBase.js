var NucleusRESTUtilsBase = Class.create();
NucleusRESTUtilsBase.prototype = {
    initialize: function( /*RESTAPIRequest*/ request, /*RESTAPIResponse*/ response, httpMethod, apiSource) {
        // Common debug class
        this.NL = new NucleusLog();

        // Properties
        // 		this.validApiKey = gs.getProperty('x_nucse_nucleus_sp.apikey');
        // 		this.apiKeyHeader = 'apikey';

        // Placeholder for DataUtils
        this.NDU = {};

        // Request and response
        this.request = request;
        this.response = response;

        // Request data placeholders
        this.httpMethod = httpMethod;
        this.headers = request.headers || {};
        this.queryParams = false;
        this.pathParams = request.pathParams || {};

        // Simplify and set queryParams
        this._setQueryParams();

        // Set body if not GET/DELETE
        this.bodyObj = false;
        if ("GET,DELETE".indexOf(httpMethod) === -1) {
            this.NL.logDebug("Setting body object: " + httpMethod);
            this.bodyObj = request.body.data;
        }

        // Log the full request in debug
        this._logDebugRequest(apiSource);
    },

    /**
     * Main processing for GeneralMappingEndpoint
     * 
     * This function abstracts the script in the API to 
     * a script include for better encapsulation and testability.
     * 
     */
    processMapping: function() {
        // Check API key, response set in check function
        if (!this._checkAPIKey('processMapping')) {
            // API Key missing or doesn't match, return here
            return;
        }

        // Allow access to queryParams with a shorter variable name
        var queryParams = this.queryParams;


        // Initialize the DataUtils script include
        this._intializeDataUtils();

        // Start to handle the request
        try {
            /**
             * Handle "Check_Table" and "Check_Incident"
             * 
             * Check_Table: 
             *  Returns entire rows in Servicenow with unmapped 
             *  ServicenowFieldName => BaseFieldValue depending on the 
             *  query made to it.
             * 
             * Check_Incident:
             *  Returns a map of Nucleus fields to the respective Servicenow 
             *  Field Values as specified in the Mapping Table. References 
             *  appear as sys_ids and Choices appear in their base value.
             */
            if (queryParams.action.startsWith("Check")) {
                // Store parameters needed
                var tableName = queryParams.table ? queryParams.table : '';

                // Debug logging
                if (queryParams.action === 'Check_Incident') {
                    this.NL.logDebug("Query - action: {0}, query: {1}, tableName: {2}", queryParams.action, this.bodyObj.query, tableName);
                    tableName = 'task';
                } else if (queryParams.action === 'Check_Table') {
                    this.NL.logDebug("Query - projectid: {0}, action: {1}, query: {2}, tableName: {3}", queryParams.projectid, queryParams.action, this.bodyObj.query, tableName);
                }

                // If we have query parameters
                if (this.bodyObj && this.bodyObj.query && tableName) {
                    // Query for the records
                    var queryRecords = this.NDU.getSNOWRecords(tableName, this.bodyObj.query, this.bodyObj.limit);
                    this.response.setBody(queryRecords);
                    return;
                } else {
                    // Set an error response
                    this._setResponse('Query not provided', false);
                    return;
                }
            } else {
                // Grab the Mappings data based on the Project Id and the Action passed into the REST API
                var nucleusFields = this.NDU.getNucleusFields(queryParams.projectid, queryParams.action);

                // If we have a fields array
                if (nucleusFields && Array.isArray(nucleusFields)) {
                    this.NL.logDebug('NucleusRESTAPI: GeneralMappingEndpoint: Retrieved {0} mapping records', nucleusFields.length);
                    this._setResponse(nucleusFields, true);
                    return;
                } else {
                    this.NL.logDebug('NucleusRESTAPI: GeneralMappingEndpoint: nucleusFields was empty, no mappings found');
                    this._setResponse('Issue with retrieving Nucleus Fields', false, 400);
                    return;
                }
            }
        } catch (err) {
            // Log an error message
            this.NL.logError('NucleusRESTAPI: GeneralMappingEndpoint: REST API for Nucleus General REST API: Catch Error in Requestbody and Mapping' + err);

            // Set the error response
            this._setResponse('Issue with retrieving Responsebody Data', false, 400);
            return;
        }
    },

    /**
     * Main processing for GeneralAPIEndpoint
     * 
     * This function abstracts the script in the API to 
     * a script include for better encapsulation and testability.
     * 
     * The GeneralAPI is called for data processing (create/update)
     * actions in the ServiceNow system.
     * 
     */
    processGeneral: function() {
        // Check API key, response set in check function
        if (!this._checkAPIKey('processGeneral')) {
            // API Key missing or doesn't match, return here
            return;
        }

        // Initialize the DataUtils script include
        this._intializeDataUtils();

        // Get parameters used
        var apiAction = this.queryParams.action;
        var projectID = this.queryParams.projectid;
		var updateOnly = this.queryParams.updateonly == 'true';

        // Handle missing parameters
        if (!apiAction || !projectID) {
            this._setResponse("Missing action or projectID parameters.", false, 400);
        }

        // Run the correct function based on action
        // If this is a TestConnection call
        if (apiAction == 'TestConnection') {
            // Pass this over to our Base Script include
            var NU = new NucleusUtilsBase(this.NL);
            response.setBody(NU.getTestConnection(projectID));
            return;
        }

        // Initialize data utils: all actions from here require it
        // Commenting out double initialize - KFC
        // this._intializeDataUtils();

        // If this is Create or Update
        if (apiAction.indexOf('Create') !== -1) {
            // Call the create function and pass in the data object
            this.NDU.createRecords(projectID, apiAction, updateOnly, this.bodyObj);
            this.NDU.createResponse();
            this.NL.logDebug("processGeneral > createRecords: " + JSON.stringify(this.NDU.createResponseData));
            this._setResponse(this.NDU.createResponseData, true);
        }

        // If this is a comment action
        else if (apiAction.indexOf('Comment') !== -1) {
            // Call the create function and pass in the data object
            var noteResult = this.NDU.addNotes(projectID, apiAction, this.bodyObj);
            if (noteResult.success) {
                // This function just returns true/false currently
                this._setResponse(noteResult.success);
            }
        }

        // If this is a resolve
        else if (apiAction.indexOf('Resolve') !== -1) {
            // Call the create function and pass in the data object
            this.NDU.resolveRecords(projectID, apiAction, this.bodyObj);
        }
    },

    /**
     * Main processing for GetDataStructureEndpoint
     * 
     * This function abstracts the script in the API to 
     * a script include for better encapsulation and testability.
     * 
     * Nucleus only passes in a table name for this functionality.
     * The expected result is 
     * 
     */
    processStructure: function() {
        // Check API key, response set in check function
        if (!this._checkAPIKey('processStructure')) {
            // API Key missing or doesn't match, return here
            return;
        }

        // Initialize the DataUtils script include
        this._intializeDataUtils();

        // Try and get the data
        try {
            // Call our Data Utils to get the mapping results for this table
            var mappingResults = this.NDU.getSNOWFields(this.queryParams.table, this.queryParams.element || "");
            if (mappingResults) {
                // Set the success response and return
                this._setResponse(mappingResults, true);
                return;
            } else {
                // Log the error
                this.NL.logError('NucleusRESTAPI: GetDataStructureEndpoint: getSNOWFields: Error in Mapping function.');

                // Set the error response and return
                this._setResponse("API table or structure is invalid. Please get with the system administrator to validate.", false, 400);
                return;
            }
        } catch (err) {
            // Log the error
            this.NL.logError('NucleusRESTAPI: GetDataStructureEndpoint: getSNOWFields: Catch Error | ' + err);

            // Set the error response and return
            this._setResponse("Issue with retrieving field data", false, 400);
            return;
        }
    },

    /**
     * Internal functions follow.
     * 
     * These are used within this script include
     * only and are considered "private" functions.
     */

    /**
     * Initialize our data utils script include
     * 
     * This class may not be needed for every function.
     * To save memory, only intialize it as a global variable
     * if it's needed.
     */
    _intializeDataUtils: function() {
        this.NDU = new NucleusDataUtils(this.NL);
    },

    /**
     * Enforce and validate API Key value
     * 
     * Shared function used by all API calls to validate
     * the authentication method.
     * 
     * @param {string} callingFunction Main function triggering check
     */
    _checkAPIKey: function(callingFunction) {
        // Default result to false
        var result = true;

        // 		// Log info message
        // 		this.NL.logInfo(callingFunction + " > _checkAPIKey");

        // 		// If the passed key does not match
        // 		var sentApiKey = this.request.headers[this.apiKeyHeader];
        // 		if (this.validApiKey !== sentApiKey) {
        // 			// Return an error
        // 			var msg = "API Key received, [ " + sentApiKey + " ], is invalid for this integration. Please get with the system administrator to validate the API Key.";
        // 			this._setResponse(msg, false, 403);
        // 			this.NL.logError("API Key does not match system property. Please verify.");
        // 		}
        // 		else {
        // 			// Check passed, set result to true
        // 			this.NL.logInfo("API Key matched system property successfully.");
        // 			result = true;
        // 		}

        // Return the result
        return result;
    },

    /**
     * Setup function to parse all parameters
     * 
     * The RESTAPIRequest documentation shows that parameters
     * come in as an array. Set all data and parameters to 
     * global variables. Simplify the objects so that values
     * are easier to access
     * 
     * https://developer.servicenow.com/dev.do#!/reference/api/sandiego/server/sn_ws-namespace/c_RESTAPIRequest#r_RESTAPIRequest_queryParams?navFilter=restapireq
     */
    _setQueryParams: function() {
        // Loop through any parameters
        var params = this.request.queryParams;
        var paramsObj = {};
        for (var key in params) {
            // If we have a valid value
            if (params[key] && Array.isArray(params[key])) {
                // Set the value on the global variable
                paramsObj[key] = params[key][0];
            } else if (params[key] && typeof params[key] === 'string') {
                // Set the string value directly
                paramsObj[key] = params[key];
            } else if (params[key]) {
                // Just set the value as a string if we hit this
                paramsObj[key] = params[key] + "";
            }
        }

        // If we have keys, set the global
        if (Object.keys(paramsObj).length > 0) {
            this.queryParams = paramsObj;
        }
    },

    /**
     * Set API response message and status
     * 
     * Utility function to speed up response formatting
     * and keep it consistent.
     * 
     * @param {mixed} message Message to send
     * @param {boolean} success Overall success flag
     * @param {integer} httpStatus Response status code to send
     * @param {object} additionalBodyData Optional keys to add to the response body
     */
    _setResponse: function(message, success, httpStatus, additionalBodyData) {
        try {
            // Default httpStatus to 200
            httpStatus = httpStatus ? httpStatus : 200;

            // Set the status
            this.response.setStatus(httpStatus);

            // Set the body based on the format expected by Nucleus
            var responseBody = {
                "responseMessage": message,
                "responseSuccess": success
            };

            // If we have keys on the additionalBodyData object
            if (additionalBodyData && Object.keys(additionalBodyData).length > 0) {
                // Loop through the keys
                for (var key in additionalBodyData) {
                    // Add to the responseBody
                    responseBody[key] = additionalBodyData[key];
                }
            }

            // Set the response to send
            this.response.setBody(responseBody);
            this.NL.logDebug("_setResponse: Response body:\n{0}", JSON.stringify(responseBody));
            this.NL.logInfo("_setResponse: Set response successfully");
        } catch (e) {
            this.NL.logError("Error in _setResponse, Error Message: " + JSON.stringify(e));
        }
    },

    /**
     * Log the full request body including query params, headers, and body
     * 
     * @param {string} apiSource Which api triggered this action
     */
    _logDebugRequest: function(apiSource) {
        // Debug values
        var queryParams = JSON.stringify(this.queryParams);
        var pathParams = JSON.stringify(this.pathParams);
        var body = JSON.stringify(this.bodyObj);
        var msg = apiSource + ": \nqueryParams:\n{0}\n\npathParams:\n{1}\n\nbody:\n{2}";
        this.NL.logDebug(msg, queryParams, pathParams, body);
    },

    type: 'NucleusRESTUtilsBase'
};