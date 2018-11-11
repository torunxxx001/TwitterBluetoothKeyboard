#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/types.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>

#include <wiringPi.h>
#include <wiringSerial.h>

#define PORT    8823    /* Listen����|�[�g */
#define MAXDATA 1024    /* ��M�o�b�t�@�T�C�Y */

#define PIN_RESET 29


void sendCommand(int fd, const char *command, char *result, int result_size)
{
	serialPuts(fd, command);
	usleep(1000*300);
	
	int idx = 0;
	for(idx = 0; idx < result_size && serialDataAvail(fd); idx++){
		result[idx] = serialGetchar(fd);
		usleep(1000);
	}
	result[idx] = '\0';
}

int checkSetting(int fd)
{
	int ret_val = 0;
	
	char ackbuf[100];

	sendCommand(fd, "$$$", ackbuf, sizeof(ackbuf));
	if(memcmp(ackbuf, "CMD", 3) != 0){
		//�R�}���h���[�h�ɓ���Ȃ�����
		printf("RN42 Command Mode Error\n");
		return -1;
	}
	printf("RN42 Command Mode Enter\n");

	//�X���[�u���[�h�`�F�b�N
	sendCommand(fd, "GM\r", ackbuf, sizeof(ackbuf));
	if(memcmp(ackbuf, "Slav", 4) != 0){
		ret_val = 1;
	}

	//�f�o�C�X���`�F�b�N
	sendCommand(fd, "GN\r", ackbuf, sizeof(ackbuf));
	if(memcmp(ackbuf, "RN42-EmKeyboard", 15) != 0){
		ret_val = 1;
	}

	//�v���t�@�C���`�F�b�N
	sendCommand(fd, "G~\r", ackbuf, sizeof(ackbuf));
	if(memcmp(ackbuf, "6", 1) != 0){
		ret_val = 1;
	}

	//HID COMBO�`�F�b�N
	sendCommand(fd, "GH\r", ackbuf, sizeof(ackbuf));
	if(memcmp(ackbuf, "0330", 4) != 0){
		ret_val = 1;
	}
	
	sendCommand(fd, "---\r", ackbuf, sizeof(ackbuf));
	if(memcmp(ackbuf, "END", 3) != 0){
		//�R�}���h���[�h����o��Ȃ�����
		printf("RN42 Command Mode End Error\n");
		return -1;
	}
	printf("RN42 Command Mode End\n");

	return ret_val;
}

int initDevice(int fd)
{
	char ackbuf[100];
	
	sendCommand(fd, "$$$", ackbuf, sizeof(ackbuf));
	if(memcmp(ackbuf, "CMD", 3) != 0){
		//�R�}���h���[�h�ɓ���Ȃ�����
		printf("RN42 Command Mode Error\n");
		return 1;
	}
	printf("RN42 Command Mode Enter\n");
	
	//�X���[�u���[�h��
	sendCommand(fd, "SM,0\r", ackbuf, sizeof(ackbuf));
	if(memcmp(ackbuf, "AOK", 3) != 0){
		printf("SM Command Error\n");
		return 1;
	}
	printf("RN42 Slave Set OK\n");
	
	//�f�o�C�X���Z�b�g
	sendCommand(fd, "SN,RN42-EmKeyboard\r", ackbuf, sizeof(ackbuf));
	if(memcmp(ackbuf, "AOK", 3) != 0){
		printf("SN Command Error\n");
		return 1;
	}
	printf("RN42 Name Set OK\n");

	//�v���t�@�C����HID��
	sendCommand(fd, "S~,6\r", ackbuf, sizeof(ackbuf));
	if(memcmp(ackbuf, "AOK", 3) != 0){
		printf("S~ Command Error\n");
		return 1;
	}
	printf("RN42 HID Profile OK\n");
	
	//HID COMBO��
	sendCommand(fd, "SH,0330\r", ackbuf, sizeof(ackbuf));
	if(memcmp(ackbuf, "AOK", 3) != 0){
		printf("SH Command Error\n");
		return 1;
	}
	printf("RN42 HID Keyboard OK\n");
	
	//���W���[�����u�[�g
	sendCommand(fd, "R,1\r", ackbuf, sizeof(ackbuf));
	if(memcmp(ackbuf, "Reboot!", 7) != 0){
		printf("Reboot Command Error\n");
		return 1;
	}
	printf("RN42 Reboot OK, wait 3sec\n");	
	
	usleep(1000*3000); //3�b�҂�

	return 0;
}

void printHex(unsigned char *data, int length){
	for(int i = 0; i < length; i++){
		printf("%02X ", data[i]);
	}
}

int main(void)
{
	int return_code = 0;

	if(wiringPiSetup() == -1){
		printf("GPIO Setup Error\n");
		return 1;
	}

	/* �V���A���|�[�g�I�[�v�� */
	int fd = serialOpen("/dev/serial0",115200);
		if(fd<0){
		printf("can not open serialport");
	}
	
	pinMode(PIN_RESET, OUTPUT);
	
	//5�񎎍s
	int tr = 0;
	for(tr = 0; tr < 5; tr++){
		digitalWrite(PIN_RESET, LOW);
		printf("RN42 RESET START, wait 1.5sec...\n");
		usleep(1000*1500);
		digitalWrite(PIN_RESET, HIGH);
		usleep(1000*1500);
		printf("RN42 RESET END, wait 1.5sec...\n");
		
		int chk_phase1 = 0;
		int chk_phase2 = 0;
		int chk_phase3 = 0;
		chk_phase1 = checkSetting(fd);
		if(chk_phase1 == 0){
			break;
		}else if(chk_phase1 == 1){
			printf("Device Init Try:%d\n", (tr+1));
			
			chk_phase2 = initDevice(fd);
			
			if(chk_phase2 == 0){
				chk_phase3 = checkSetting(fd);
				
				if(chk_phase3 == 0){
					break;
				}
			}
		}
	}
	if(tr == 5){
		printf("Device Init Limit Error\n");
		close(fd);
		return 1;
	}

	
    struct sockaddr_in saddr; /* �T�[�o�p�A�h���X�i�[�\���� */
    struct sockaddr_in caddr; /* �N���C�A���g�p�A�h���X�i�[�\���� */

    int listen_fd;
    int conn_fd;
	int exit_f = 0;

    socklen_t len = sizeof(struct sockaddr_in);

    /* �\�P�b�g�̐��� */
    if ((listen_fd = socket(AF_INET, SOCK_STREAM, 0)) < 0) {
        perror("socket");
        return 1;
    }
	
	int yes = 1;
	
	setsockopt(listen_fd, SOL_SOCKET, SO_REUSEADDR, (const char *)&yes, sizeof(yes));

    /* 
      * saddr�̒��g��0�ɂ��Ă����Ȃ��ƁAbind()�ŃG���[���N���邱�Ƃ�����
     */
    bzero((char *)&saddr, sizeof(saddr));

    /* �\�P�b�g�ɃA�h���X�ƃ|�[�g�����т��� */
    saddr.sin_family        = PF_INET;
    saddr.sin_addr.s_addr   = INADDR_ANY;
    saddr.sin_port          = htons(PORT);
    if (bind(listen_fd, (struct sockaddr *)&saddr, len) < 0) {
        perror("bind");
        return 1;
    }

    /* �|�[�g��Listen���� */
    if (listen(listen_fd, SOMAXCONN) < 0) {
        perror("listen");
        return 1;
    }
    printf("Start Listening Port : %d...\n", PORT);

 /* �ڑ��v�����󂯕t���� */
	do{
	    if ((conn_fd = accept(listen_fd, (struct sockaddr *)&caddr, &len)) < 0) {
	        perror("accept");
	        return 1;
	    }


	    /* ���M���ꂽ�f�[�^�̓ǂݏo�� */
		int rsize = 0;
		int num_of_read = 0;
		int total_data_len = 0;
		unsigned char buf[1024];
		unsigned char subbuf[1024];
		unsigned char datacont[1024];
	    do {
	        rsize = recv(conn_fd, buf, MAXDATA, 0);
	    	
	        if (rsize == 0) { /* �N���A�C���g���ڑ���؂����Ƃ� */
	                printf("Connection closed.\n");
	        		close(conn_fd);
	                break;
	        } else if (rsize == -1) {
	                perror("recv");
	                return 1;
	        } else {
	        	memcpy(&subbuf[num_of_read], buf, rsize);
	        	num_of_read += rsize;
	        	
	        	if(total_data_len == 0 && num_of_read >= 6){
	        		char lenstr_buf[7];
	        		memcpy(lenstr_buf, subbuf, 6);
	        		lenstr_buf[6] = '\0';
	        		
	        		total_data_len = atoi(lenstr_buf);
	        		if(total_data_len == 0) {
	        			printf("len error\n");
		        		num_of_read = 0;
	        		}
	        	}
	        	if(total_data_len > 0 && num_of_read - 6 >= total_data_len){
	        		memcpy(datacont, &subbuf[6], total_data_len);
	        		
	        		if(memcmp(datacont, "<!reboot!>", 10) == 0){
	        			send(conn_fd, "OK", 2, 0);

	        			return_code = 9;
	        			exit_f = 1; break;
	        		}
	        		if(memcmp(datacont, "<!exit!>", 8) == 0){
	        			send(conn_fd, "OK", 2, 0);

	        			exit_f = 1; break;
	        		}
	        		
	        		printf("SendData: "); printHex(datacont, total_data_len); printf("\n");
	        		write(fd, datacont, total_data_len);
	        		
	        		unsigned char *resp_buf = new unsigned char[total_data_len + 5];
	        		memcpy(resp_buf, "SEND-", 5);
	        		memcpy(&resp_buf[5], datacont, total_data_len);
	        		send(conn_fd, resp_buf, total_data_len + 5, 0);
	        		delete[] resp_buf;
	        		
	        		num_of_read = 0;
	        		total_data_len = 0;
	        	}
	        }
	    } while (1);
	}while(exit_f == 0);

    /* Listening�\�P�b�g����� */
    close(listen_fd);

	//�V���A���|�[�g�����
	close(fd);

    return return_code;
}