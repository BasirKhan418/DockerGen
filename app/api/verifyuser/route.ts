import { NextRequest,NextResponse } from "next/server";
import { cookies } from "next/headers";
import User from "@/models/User";
import ConnectDb from "@/middleware/connectDb";
import jwt from "jsonwebtoken";
import CryptoJS from "crypto-js";
export const GET = async()=>{
    const getcookie = cookies();
    try{
        await ConnectDb()
//checking auths
        const ltoken: any = getcookie.get("ltoken");

        console.log("Using secret key:", process.env.SECRET_KEY);
        console.log("Cookie ltoken value:", ltoken?.value);
        try{
            let ltoken:any = getcookie.get("ltoken");
            if(ltoken){
                const decoded:any = jwt.verify(ltoken.value, process.env.SECRET_KEY|| "");
                let user = await User.findOne({email:decoded.email});
                if(user==null){
                    return NextResponse.json({
                        message:"no auth",
                        success:false,
                        auth:false
                    })
                }
                let token = CryptoJS.AES.decrypt(user.githubtoken,process.env.SECRET_KEY||"").toString(CryptoJS.enc.Utf8);
                //fetching all repo
                const repodata = await fetch(
                    "https://api.github.com/user/repos?per_page=500",
                    {
                        headers: {
                            Authorization: `token ${token}`,
                        },
                    }
                );
                const res = await repodata.json();
                //finally sending the reponse
                return NextResponse.json({
                    message:"User fetched",
                    data:user,
                    token:token,
                    repo:res,
                    success:true
                })
            }
            else{
                return NextResponse.json({
                    message:"no auth",
                    success:false,
                    auth:false
                })
            }
        }
        catch(err){
            return NextResponse.json({
                message:"no auth",
                success:false,
                auth:false
            })
        }
    }
    catch(err){
        return NextResponse.json({
            message:"some thing went wrong with auth",
            success:false
        })
    }
}
