import { NextRequest, NextResponse } from "next/server";
import User from "../../../../models/User";
import ConnectDb from "../../../../middleware/connectDb";
import CryptoJS from "crypto-js";
import { cookies } from "next/headers";
import jwt from "jsonwebtoken";

const BASE_URL = process.env.NEXT_URL || "http://localhost:3000";
const ERROR_REDIRECT = new URL("/githuberr", BASE_URL).toString();
const HOME_REDIRECT = new URL("/", BASE_URL).toString();

export const GET = async (req: NextRequest) => {
    const cookieStore = cookies();

    console.log('GitHub OAuth callback received');
    console.log('Request URL:', req.url);

    try {
        // Connect to database first
        console.log('Connecting to database...');
        await ConnectDb();
        console.log('Database connected successfully');

        // Extract and validate query parameters
        const { searchParams } = new URL(req.url);
        const code = searchParams.get('code');
        const state = searchParams.get('state');
        const error = searchParams.get('error');

        console.log('OAuth parameters:', { code: !!code, state, error });

        // Check for GitHub OAuth error
        if (error) {
            console.log('GitHub OAuth Error:', error);
            return NextResponse.redirect(ERROR_REDIRECT);
        }

        // Validate required parameters
        if (!code || !state) {
            console.log('Missing required OAuth parameters');
            return NextResponse.redirect(ERROR_REDIRECT);
        }

        // Validate state parameter
        if (state !== process.env.NEXT_PUBLIC_STATE) {
            console.log('Invalid state parameter');
            return NextResponse.redirect(ERROR_REDIRECT);
        }

        console.log('Exchanging code for access token...');

        // Get GitHub access token
        const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "User-Agent": "DockerGen-App"
            },
            body: JSON.stringify({
                client_id: process.env.NEXT_PUBLIC_GIT_HUB_CLIENT_ID,
                client_secret: process.env.GIT_HUB_CLIENT_SECRET,
                code,
                redirect_uri: process.env.NEXT_PUBLIC_GIT_HUB_REDIRECT_URI,
                state: process.env.NEXT_PUBLIC_STATE
            })
        });

        if (!tokenResponse.ok) {
            console.log('Token exchange failed:', tokenResponse.status, tokenResponse.statusText);
            return NextResponse.redirect(ERROR_REDIRECT);
        }

        const tokenData = await tokenResponse.json();
        console.log('Token exchange response:', {
            hasAccessToken: !!tokenData.access_token,
            error: tokenData.error
        });

        if (tokenData.error) {
            console.log('GitHub OAuth Token Error:', tokenData.error_description);
            return NextResponse.redirect(ERROR_REDIRECT);
        }

        if (!tokenData.access_token) {
            console.log('No access token received');
            return NextResponse.redirect(ERROR_REDIRECT);
        }

        console.log('Fetching GitHub user details...');

        // Get GitHub user details
        const userResponse = await fetch("https://api.github.com/user", {
            headers: {
                "Authorization": `Bearer ${tokenData.access_token}`,
                "Accept": "application/vnd.github.v3+json",
                "User-Agent": "DockerGen-App"
            }
        });

        if (!userResponse.ok) {
            console.log('Failed to fetch user details:', userResponse.status, userResponse.statusText);
            return NextResponse.redirect(ERROR_REDIRECT);
        }

        const githubUser = await userResponse.json();
        console.log('GitHub user fetched:', {
            login: githubUser.login,
            name: githubUser.name,
            email: githubUser.email
        });

        // Validate required user data
        if (!githubUser.login) {
            console.log('Invalid user data received from GitHub');
            return NextResponse.redirect(ERROR_REDIRECT);
        }

        // Encrypt GitHub token
        console.log('Encrypting GitHub token...');
        const encryptedToken = CryptoJS.AES.encrypt(
            tokenData.access_token,
            process.env.SECRET_KEY || ""
        ).toString();

        // Generate JWT token
        console.log('Generating JWT token...');
        const authToken = jwt.sign(
            {
                name: githubUser.name || githubUser.login,
                email: githubUser.email || `${githubUser.login}@github.local`,
                githubid: githubUser.login
            },
            process.env.SECRET_KEY || "",
            { expiresIn: '7d' }
        );

        // Set authentication cookie
        console.log('Setting authentication cookie...');
        cookieStore.set({
            name: 'ltoken',
            value: authToken,
            httpOnly: true,
            path: '/',
            maxAge: 60 * 60 * 24 * 7, // 7 days in seconds
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax'
        });

        // Update or create user in database
        console.log('Updating user in database...');
        const userData = {
            name: githubUser.name || githubUser.login,
            email: githubUser.email || `${githubUser.login}@github.local`,
            githubid: githubUser.login,
            githubtoken: encryptedToken,
            img: githubUser.avatar_url || "",
        };

        const user = await User.findOneAndUpdate(
            { githubid: githubUser.login },
            userData,
            { upsert: true, new: true }
        );

        console.log('User updated successfully:', user._id);
        console.log('Redirecting to home page...');

        return NextResponse.redirect(HOME_REDIRECT);

    } catch (error) {
        console.error('GitHub OAuth Error:', error);
        console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');

        // Return a more specific error response
        if (error instanceof Error && error.message.includes('URI must include hostname')) {
            console.error('Database connection error - check MONGO_URL');
        }

        return NextResponse.redirect(ERROR_REDIRECT);
    }
};
