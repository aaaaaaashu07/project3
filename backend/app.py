import os
from functools import wraps
from flask import Flask, jsonify, request
from flask_cors import CORS
import supabase
from dotenv import load_dotenv
import google.generativeai as genai
from datetime import datetime, timedelta

# --- Initialization ---
load_dotenv()

# --- Supabase Initialization ---
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Supabase URL and Key must be set in the .env file.")

try:
    supabase_client = supabase.create_client(SUPABASE_URL, SUPABASE_KEY)
    print("✅ Successfully initialized Supabase client")
except Exception as e:
    print(f"❌ Error initializing Supabase client: {e}")

# --- Gemini API Initialization ---
try:
    gemini_api_key = os.getenv('GEMINI_API_KEY')
    if not gemini_api_key:
        raise ValueError("GEMINI_API_KEY not found in .env file.")
    genai.configure(api_key=gemini_api_key)
    gemini_model = genai.GenerativeModel('gemini-1.5-flash')
    print("✅ Successfully initialized Gemini API")
except Exception as e:
    print(f"❌ Error initializing Gemini API: {e}")


# --- Flask App Initialization ---
app = Flask(__name__)
CORS(app)


# --- Helper Function to Ensure User Profile Exists ---
def ensure_user_profile_exists(user_id, email):
    """
    Checks if a user profile exists in public.users and creates it if not.
    This is a self-healing mechanism for the database.
    """
    try:
        supabase_client.table('users').upsert({
            'id': str(user_id),
            'email': email
        }).execute()
        return True
    except Exception as e:
        app.logger.error(f"CRITICAL: Failed to upsert user profile for {user_id}: {e}")
        return False


# --- Authentication Decorator ---
def require_auth(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({"error": "Authorization header is missing or invalid"}), 401

        jwt = auth_header.split('Bearer ').pop()
        try:
            user_response = supabase_client.auth.get_user(jwt)
            user = user_response.user

            profile_ok = ensure_user_profile_exists(user.id, user.email)
            if not profile_ok:
                return jsonify({"error": "Could not verify user profile. Please try again."}), 500
        
            # Pass the user object to the decorated function
            return f(user=user, *args, **kwargs)

        except Exception as e:
            app.logger.error(f"Error verifying token: {e}")
            return jsonify({"error": "Invalid or expired token"}), 401
    return decorated_function

# --- API ROUTES ---

@app.route('/register', methods=['POST'])
def register_user():
    """
    Handles user registration using the admin client for reliability.
    """
    data = request.json
    email = data.get('email')
    password = data.get('password')

    if not email or not password:
        return jsonify({"error": "Email and password are required."}), 400

    try:
        created_user_res = supabase_client.auth.admin.create_user({
            "email": email,
            "password": password,
            "email_confirm": True,
        })

        if getattr(created_user_res, "error", None):
            err_msg = str(created_user_res.error)
            if "User already registered" in err_msg or "already exists" in err_msg:
                return jsonify({"error": "A user with this email already exists."}), 400
            return jsonify({"error": err_msg}), 400

        new_user = created_user_res.user
        if not new_user:
            return jsonify({"error": "Failed to create user. No user returned from Supabase."}), 500

        supabase_client.table('users').upsert({
            'id': str(new_user.id),
            'email': new_user.email
        }).execute()

        return jsonify({"message": "Registration successful! You can now log in."}), 201

    except Exception as e:
        app.logger.error(f"REGISTRATION CRASH: {e}")
        return jsonify({"error": "An unexpected server error occurred during registration."}), 500


@app.route('/suggest-description', methods=['POST'])
@require_auth
def suggest_description(user):
    data = request.json
    if not data or not data.get('title'):
        return jsonify({"error": "Task title is required."}), 400

    title = data['title']
    prompt = (
        f'Based on the task title "{title}", generate a helpful and structured task description template.\n'
        "The user wants to post a hyperlocal delivery task.\n"
        "The description should be a template that the user can easily fill out.\n"
        "Include prompts for essential details like:\n"
        "- Item Details (e.g., dimensions, weight, fragility)\n"
        "- Pickup Location (e.g., specific address, contact person)\n"
        "- Drop-off Location (e.g., specific address, contact person)\n"
        "- Deadline or Time Window\n"
        "Keep it concise and formatted as plain text with clear sections."
    )

    try:
        response = gemini_model.generate_content(prompt)
        return jsonify({"suggestion": response.text})
    except Exception as e:
        app.logger.error(f"Error getting AI suggestion: {e}")
        return jsonify({"error": "Failed to get AI suggestion."}), 500

@app.route('/tasks', methods=['GET'])
def get_all_tasks():
    try:
        tasks_response = supabase_client.table('tasks').select("*, users!tasks_poster_id_fkey(email)").order('created_at', desc=True).execute()
        return jsonify(tasks_response.data), 200
    except Exception as e:
        app.logger.error(f"Error in get_all_tasks: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/tasks', methods=['POST'])
@require_auth
def create_task(user):
    data = request.json
    is_urgent = data.get('is_urgent', False)

    task_payload = {
        'title': data.get('title'),
        'description': data.get('description'),
        'budget': data.get('budget'),
        'from_location': data.get('from_location'),
        'to_location': data.get('to_location'),
        'poster_id': str(user.id)
    }

    if not all([task_payload['title'], task_payload['budget']]):
        return jsonify({"error": "Title and budget are required."}), 400

    if is_urgent:
        task_payload['expires_at'] = (datetime.utcnow() + timedelta(hours=24)).isoformat()

    try:
        response = supabase_client.table('tasks').insert(task_payload).execute()
        return jsonify(response.data[0]), 201
    except Exception as e:
        app.logger.error(f"Error creating task: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/tasks/<int:task_id>', methods=['GET'])
def get_task_details(task_id):
    try:
        task_response = supabase_client.table('tasks').select("*, users!tasks_poster_id_fkey(email)").eq('id', task_id).single().execute()
        if not task_response.data:
            return jsonify({"error": "Task not found"}), 404

        bids_response = supabase_client.table('bids').select("*, users!bids_bidder_id_fkey(email)").eq('task_id', task_id).execute()

        return jsonify({"task": task_response.data, "bids": bids_response.data}), 200
    except Exception as e:
        app.logger.error(f"Error in get_task_details: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/tasks/<int:task_id>/bids', methods=['POST'])
@require_auth
def post_bid(user, task_id):
    data = request.json
    if not all([data.get('amount'), data.get('timeEstimate')]):
        return jsonify({"error": "Amount and time estimate are required."}), 400

    try:
        task_owner_res = supabase_client.table('tasks').select('poster_id, title').eq('id', task_id).single().execute()
        if not task_owner_res.data:
            return jsonify({"error": "Task not found."}), 404

        task_data = task_owner_res.data
        if task_data['poster_id'] == str(user.id):
            return jsonify({"error": "You cannot bid on your own task."}), 403

        bid_response = supabase_client.table('bids').insert({
            'amount': data['amount'],
            'time_estimate': data['timeEstimate'],
            'task_id': task_id,
            'bidder_id': str(user.id)
        }).execute()

        supabase_client.table('notifications').insert({
            'user_id': task_data['poster_id'],
            'message': f"You have a new bid on your task: '{task_data['title']}'",
            'link': f'#task-{task_id}'
        }).execute()

        return jsonify(bid_response.data[0]), 201
    except Exception as e:
        app.logger.error(f"Error posting bid: {e}")
        return jsonify({"error": "An internal server error occurred."}), 500


@app.route('/tasks/<int:task_id>/accept_bid', methods=['POST'])
@require_auth
def accept_bid(user, task_id):
    bid_id = request.json.get('bid_id')
    try:
        task_res = supabase_client.table('tasks').select('poster_id, title').eq('id', task_id).single().execute()
        if not task_res.data or task_res.data['poster_id'] != str(user.id):
            return jsonify({"error": "Unauthorized"}), 403

        task_data = task_res.data
        bid_info = supabase_client.table('bids').select('bidder_id').eq('id', bid_id).single().execute()
        if not bid_info.data:
            return jsonify({"error": "Bid not found"}), 404

        update_response = supabase_client.table('tasks').update({
            'status': 'assigned',
            'volunteer_id': bid_info.data['bidder_id'],
            'accepted_bid_id': bid_id
        }).eq('id', task_id).execute()

        supabase_client.table('notifications').insert({
            'user_id': bid_info.data['bidder_id'],
            'message': f"Your bid for '{task_data['title']}' was accepted!",
            'link': f'#task-{task_id}'
        }).execute()

        return jsonify(update_response.data[0]), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/tasks/<int:task_id>', methods=['DELETE'])
@require_auth
def delete_task(user, task_id):
    """
    Protected route for a user to delete their own task.
    """
    try:
        task_res = supabase_client.table('tasks').select('poster_id').eq('id', task_id).single().execute()

        if not task_res.data:
            return jsonify({"error": "Task not found"}), 404

        if task_res.data['poster_id'] != str(user.id):
            return jsonify({"error": "You are not authorized to delete this task"}), 403

        delete_response = supabase_client.table('tasks').delete().eq('id', task_id).execute()

        return jsonify({"message": "Task deleted successfully"}), 200

    except Exception as e:
        app.logger.error(f"Error deleting task {task_id}: {e}")
        return jsonify({"error": "An internal server error occurred."}), 500

# --- Main execution ---
if __name__ == '__main__':
    app.run(debug=True, port=5000)