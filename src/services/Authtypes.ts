export interface UserData {
  userid: string;
  userida: string;
  name: string;
  photo: string;
  email: string;
  mobile: string;
  usertype: string;
  schoolid: string;
  schoolname: string;
  locationname: string;
  locationid: string;
  termid: string;
  termname: string;
  schoollogo: string;
  userguid: string;
  password: string;
}





export interface LoginApiResponse {
  status: string; // "1" = success, per sample response
  message: string;
  data: UserData[];
}

export interface StoredSession {
  user: UserData;
  username: string;
  password: string;
  loggedInAt: number;
}